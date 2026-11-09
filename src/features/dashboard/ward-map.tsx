import { useEffect, useState, type FormEvent } from "react";
import {
  BedDouble,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  humanise,
  loadWards,
  loadWardBeds,
  type StaffContext,
  type Ward,
  type WardBed,
} from "./data";
import { EmptyState, Panel } from "./ui";

const BED_STATUSES = ["active", "inactive"];

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

type BedDraft = {
  bedCode: string;
  ward: string;
  bedType: string;
  status: string;
  occupied: boolean;
};

type WardDraft = {
  name: string;
  wardType: string;
  floor: string;
  capacity: string;
  phone: string;
  notes: string;
};

const EMPTY_WARD_DRAFT: WardDraft = {
  name: "",
  wardType: "general",
  floor: "",
  capacity: "",
  phone: "",
  notes: "",
};

const WARD_FIELDS =
  "id, name, ward_type, floor, capacity, phone, notes, status" as const;

function toWard(row: {
  id: string;
  name: string;
  ward_type: string;
  floor: string | null;
  capacity: number | null;
  phone: string | null;
  notes: string | null;
  status: string;
}): Ward {
  return {
    id: row.id,
    name: row.name,
    wardType: row.ward_type,
    floor: row.floor,
    capacity: row.capacity,
    phone: row.phone,
    notes: row.notes,
    status: row.status,
  };
}

/**
 * Ward board for the facility. Wards are real records (name, type, floor,
 * capacity, phone, notes) that can be added, edited and removed; each ward
 * shows its beds and their current occupant. Hospital administrators and
 * nurses can manage wards and beds, other roles see the same board read-only.
 */
export function WardVisualizationPanel({
  ctx,
  beds,
  wards,
  canEdit,
}: {
  ctx: StaffContext;
  beds: WardBed[];
  wards: Ward[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(beds);
  const [wardRows, setWardRows] = useState(wards);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BedDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newBed, setNewBed] = useState({
    bedCode: "",
    ward: "",
    bedType: "general",
  });
  const [removeArmedId, setRemoveArmedId] = useState<string | null>(null);

  const [wardFormOpen, setWardFormOpen] = useState(false);
  const [editingWardId, setEditingWardId] = useState<string | null>(null);
  const [wardDraft, setWardDraft] = useState<WardDraft>(EMPTY_WARD_DRAFT);
  const [wardSaving, setWardSaving] = useState(false);
  const [wardRemoveId, setWardRemoveId] = useState<string | null>(null);

  useEffect(() => {
    setRows(beds);
  }, [beds]);

  useEffect(() => {
    setWardRows(wards);
  }, [wards]);

  const canManageWards = canEdit && Boolean(ctx.tenantId && ctx.facilityId);
  const wardNames = [
    ...new Set([
      ...wardRows.map((ward) => ward.name),
      ...rows.map((bed) => bed.ward),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const occupied = rows.filter(
    (bed) => bed.patient || bed.manuallyOccupied,
  ).length;
  const inactive = rows.filter((bed) => bed.status !== "active").length;
  const available = rows.length - occupied - inactive;
  const editingBed = rows.find((bed) => bed.bedId === editingId) ?? null;

  function wardFor(name: string) {
    return wardRows.find((ward) => ward.name === name) ?? null;
  }

  function resetWardForm() {
    setWardFormOpen(false);
    setEditingWardId(null);
    setWardDraft(EMPTY_WARD_DRAFT);
  }

  function startAddWard() {
    setEditingWardId(null);
    setWardDraft(EMPTY_WARD_DRAFT);
    setWardFormOpen(true);
  }

  function startEditWard(name: string) {
    const ward = wardFor(name);
    setEditingWardId(ward?.id ?? null);
    setWardDraft({
      name,
      wardType: ward?.wardType ?? "general",
      floor: ward?.floor ?? "",
      capacity: ward?.capacity === null ? "" : String(ward?.capacity ?? ""),
      phone: ward?.phone ?? "",
      notes: ward?.notes ?? "",
    });
    setWardFormOpen(true);
  }

  async function saveWard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx.tenantId || !ctx.facilityId) {
      toast.error("Your workspace is missing its hospital or facility.");
      return;
    }
    const name = wardDraft.name.trim();
    if (!name) {
      toast.error("Give the ward a name, for example General Ward.");
      return;
    }
    const capacity =
      wardDraft.capacity.trim() === "" ? null : Number(wardDraft.capacity);
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
      toast.error("Capacity must be a number of zero or more.");
      return;
    }

    const payload = {
      name,
      ward_type: wardDraft.wardType.trim() || "general",
      floor: wardDraft.floor.trim() || null,
      capacity,
      phone: wardDraft.phone.trim() || null,
      notes: wardDraft.notes.trim() || null,
    };

    setWardSaving(true);
    if (editingWardId) {
      const previousName =
        wardRows.find((ward) => ward.id === editingWardId)?.name ?? name;
      const { data: updated, error } = await supabase
        .from("wards")
        .update(payload)
        .eq("id", editingWardId)
        .eq("tenant_id", ctx.tenantId)
        .eq("facility_id", ctx.facilityId)
        .select(WARD_FIELDS)
        .maybeSingle();
      setWardSaving(false);
      if (error || !updated) {
        toast.error(
          error
            ? `Could not save the ward: ${error.code === "23505" ? "a ward with this name already exists" : error.message}`
            : "The ward could not be saved.",
        );
        return;
      }

      const saved = toWard(updated);
      setWardRows((current) =>
        current
          .map((ward) => (ward.id === saved.id ? saved : ward))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      if (previousName !== saved.name) {
        const { error: bedRenameError } = await supabase
          .from("beds")
          .update({ ward: saved.name })
          .eq("tenant_id", ctx.tenantId)
          .eq("facility_id", ctx.facilityId)
          .eq("ward", previousName);
        if (bedRenameError) {
          toast.error(
            `Ward saved, but its beds could not be renamed: ${bedRenameError.message}`,
          );
        } else {
          setRows((current) =>
            current.map((bed) =>
              bed.ward === previousName ? { ...bed, ward: saved.name } : bed,
            ),
          );
        }
      }

      resetWardForm();
      toast.success(`${saved.name} saved`);
      return;
    }

    const { data: created, error } = await supabase
      .from("wards")
      .insert({
        tenant_id: ctx.tenantId,
        facility_id: ctx.facilityId,
        ...payload,
        status: "active",
      })
      .select(WARD_FIELDS)
      .single();
    setWardSaving(false);
    if (error || !created) {
      toast.error(
        error
          ? `Could not add the ward: ${error.code === "23505" ? "a ward with this name already exists" : error.message}`
          : "The ward could not be added.",
      );
      return;
    }

    const saved = toWard(created);
    setWardRows((current) =>
      [...current, saved].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setNewBed((current) => ({ ...current, ward: current.ward || saved.name }));
    resetWardForm();
    toast.success(`${saved.name} added`);
  }

  async function removeWard(ward: Ward) {
    if (!ctx.tenantId || !ctx.facilityId) return;
    const bedCount = rows.filter((bed) => bed.ward === ward.name).length;
    if (bedCount > 0) {
      toast.error(
        `${ward.name} still has ${bedCount} bed${bedCount === 1 ? "" : "s"}. Remove or move them first.`,
      );
      return;
    }
    if (wardRemoveId !== ward.id) {
      setWardRemoveId(ward.id);
      return;
    }

    setWardSaving(true);
    const { error } = await supabase
      .from("wards")
      .delete()
      .eq("id", ward.id)
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId);
    setWardSaving(false);
    setWardRemoveId(null);
    if (error) {
      toast.error(`Could not remove ${ward.name}: ${error.message}`);
      return;
    }
    setWardRows((current) => current.filter((row) => row.id !== ward.id));
    toast.success(`${ward.name} removed`);
  }

  function beginEdit(bed: WardBed) {
    setEditingId(bed.bedId);
    setDraft({
      bedCode: bed.bedCode,
      ward: bed.ward,
      bedType: bed.bedType,
      status: bed.status,
      occupied: bed.manuallyOccupied,
    });
  }

  function startAddBed(wardName: string) {
    const ward = wardFor(wardName);
    setNewBed({
      bedCode: "",
      ward: wardName,
      bedType: ward?.wardType ?? "general",
    });
    setAdding(true);
  }

  async function addBed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bedCode = newBed.bedCode.trim();
    const ward = newBed.ward.trim();
    const bedType = newBed.bedType.trim();
    if (!bedCode || !ward || !bedType) {
      toast.error("Enter the bed code, ward and bed type.");
      return;
    }
    if (!ctx.tenantId || !ctx.facilityId) {
      toast.error("Your workspace is missing its hospital or facility.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("beds")
      .insert({
        tenant_id: ctx.tenantId,
        facility_id: ctx.facilityId,
        bed_code: bedCode,
        ward,
        bed_type: bedType,
        status: "active",
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(
        error
          ? `Could not add bed: ${error.code === "23505" ? `bed ${bedCode} already exists in this facility` : error.message}`
          : "The bed could not be added.",
      );
      return;
    }

    setRows((current) => [
      ...current,
      {
        bedId: data.id,
        bedCode,
        ward,
        bedType,
        status: "active",
        patient: null,
        patientNumber: null,
        admissionId: null,
        assignmentId: null,
        admittedAt: null,
        manuallyOccupied: false,
      },
    ]);
    setNewBed({ bedCode: "", ward, bedType: "general" });
    setAdding(false);
    toast.success(`Bed ${bedCode} added to ${ward}`);
  }

  async function removeBed(bed: WardBed) {
    if (bed.patient) {
      toast.error(
        "Discharge or transfer the patient before removing this bed.",
      );
      return;
    }
    if (removeArmedId !== bed.bedId) {
      setRemoveArmedId(bed.bedId);
      return;
    }
    if (!ctx.tenantId || !ctx.facilityId) {
      toast.error("Your workspace is missing its hospital or facility.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("beds")
      .delete()
      .eq("id", bed.bedId)
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId);
    setSaving(false);
    setRemoveArmedId(null);
    if (error) {
      toast.error(`Could not remove bed: ${error.message}`);
      return;
    }
    setRows((current) => current.filter((row) => row.bedId !== bed.bedId));
    setEditingId(null);
    setDraft(null);
    toast.success(`Bed ${bed.bedCode} removed`);
  }

  async function saveBed(bed: WardBed) {
    if (!draft) return;
    const bedCode = draft.bedCode.trim();
    const ward = draft.ward.trim();
    const bedType = draft.bedType.trim();
    if (!bedCode || !ward || !bedType) {
      toast.error("Enter the bed code, ward and bed type.");
      return;
    }
    if (!ctx.tenantId || !ctx.facilityId) {
      toast.error("Your workspace is missing its hospital or facility.");
      return;
    }

    setSaving(true);
    const { data: updated, error } = await supabase
      .from("beds")
      .update({
        bed_code: bedCode,
        ward,
        bed_type: bedType,
        status: draft.status,
        is_occupied: draft.occupied,
      })
      .eq("id", bed.bedId)
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(`Could not update bed: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error("Bed could not be updated. Check your access and try again.");
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.bedId === bed.bedId
          ? {
              ...row,
              bedCode,
              ward,
              bedType,
              status: draft.status,
              manuallyOccupied: draft.occupied,
            }
          : row,
      ),
    );
    setEditingId(null);
    setDraft(null);
    toast.success(`Bed ${bedCode} updated`);
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Wards"
        subtitle="The wards in this facility, their details and the beds in each one."
        {...(canManageWards
          ? {
              action: (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={startAddWard}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    <Plus className="size-4" /> Add ward
                  </button>
                </div>
              ),
            }
          : {})}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
            {wardNames.length} wards
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
            {rows.length} beds
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
            {occupied} occupied
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
            {available} available
          </span>
          {inactive > 0 && (
            <span className="rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
              {inactive} inactive
            </span>
          )}
        </div>

        {canManageWards && wardFormOpen && (
          <form
            onSubmit={(event) => void saveWard(event)}
            className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            <label className="text-xs font-medium text-muted-foreground">
              Ward name
              <input
                required
                value={wardDraft.name}
                onChange={(event) =>
                  setWardDraft({
                    ...wardDraft,
                    name: event.currentTarget.value,
                  })
                }
                placeholder="e.g. General Ward"
                disabled={wardSaving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Ward type
              <input
                value={wardDraft.wardType}
                onChange={(event) =>
                  setWardDraft({
                    ...wardDraft,
                    wardType: event.currentTarget.value,
                  })
                }
                placeholder="e.g. general, maternity, ICU"
                disabled={wardSaving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Floor
              <input
                value={wardDraft.floor}
                onChange={(event) =>
                  setWardDraft({
                    ...wardDraft,
                    floor: event.currentTarget.value,
                  })
                }
                placeholder="e.g. First floor"
                disabled={wardSaving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Planned beds
              <input
                type="number"
                min="0"
                step="1"
                value={wardDraft.capacity}
                onChange={(event) =>
                  setWardDraft({
                    ...wardDraft,
                    capacity: event.currentTarget.value,
                  })
                }
                placeholder="e.g. 24"
                disabled={wardSaving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Phone / extension
              <input
                value={wardDraft.phone}
                onChange={(event) =>
                  setWardDraft({
                    ...wardDraft,
                    phone: event.currentTarget.value,
                  })
                }
                placeholder="e.g. Ext 120"
                disabled={wardSaving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Notes
              <input
                value={wardDraft.notes}
                onChange={(event) =>
                  setWardDraft({
                    ...wardDraft,
                    notes: event.currentTarget.value,
                  })
                }
                placeholder="Anything staff should know"
                disabled={wardSaving}
                className={fieldClass}
              />
            </label>
            <div className="flex gap-2 sm:col-span-2 xl:col-span-3">
              <button
                type="submit"
                disabled={wardSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {wardSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {wardSaving
                  ? "Saving…"
                  : editingWardId
                    ? "Save ward"
                    : "Add ward"}
              </button>
              <button
                type="button"
                onClick={resetWardForm}
                disabled={wardSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                <X className="size-4" /> Cancel
              </button>
            </div>
          </form>
        )}

        {canManageWards && adding && (
          <form
            onSubmit={(event) => void addBed(event)}
            className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <label className="text-xs font-medium text-muted-foreground">
              Bed code
              <input
                required
                value={newBed.bedCode}
                onChange={(event) =>
                  setNewBed({ ...newBed, bedCode: event.currentTarget.value })
                }
                placeholder="e.g. GW-07"
                disabled={saving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Ward
              <input
                required
                list="ward-name-options"
                value={newBed.ward}
                onChange={(event) =>
                  setNewBed({ ...newBed, ward: event.currentTarget.value })
                }
                placeholder="e.g. General Ward"
                disabled={saving}
                className={fieldClass}
              />
              <datalist id="ward-name-options">
                {wardNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Bed type
              <input
                required
                value={newBed.bedType}
                onChange={(event) =>
                  setNewBed({ ...newBed, bedType: event.currentTarget.value })
                }
                placeholder="e.g. general, ICU, maternity"
                disabled={saving}
                className={fieldClass}
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add bed
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                <X className="size-4" /> Cancel
              </button>
            </div>
          </form>
        )}

        {!wardNames.length && (
          <EmptyState
            icon={BedDouble}
            title="No wards yet"
            description={
              canManageWards
                ? "Add a ward with its details, or load the sample wards to get started."
                : "Wards added by the hospital administrator will appear here."
            }
          />
        )}
      </Panel>

      {wardNames.map((wardName) => {
        const wardBeds = rows.filter((bed) => bed.ward === wardName);
        const wardOccupied = wardBeds.filter(
          (bed) => bed.patient || bed.manuallyOccupied,
        ).length;
        const wardActive = wardBeds.filter(
          (bed) => bed.status === "active",
        ).length;
        const ward = wardFor(wardName);
        const details = ward
          ? [
              humanise(ward.wardType),
              ward.floor ?? "Floor not set",
              ward.capacity === null
                ? "No planned capacity"
                : `${ward.capacity} planned beds`,
              ward.phone ?? "No phone",
            ]
          : [];
        return (
          <Panel
            key={wardName}
            title={wardName}
            subtitle={
              ward
                ? `${details.join(" · ")} · ${wardOccupied}/${wardActive} active beds occupied`
                : `${wardBeds.length} beds · ${wardOccupied} occupied · added from a bed only`
            }
            {...(canManageWards
              ? {
                  action: (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startAddBed(wardName)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        <Plus className="size-3.5" /> Bed
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditWard(wardName)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        <Pencil className="size-3.5" />
                        {ward ? "Edit" : "Add details"}
                      </button>
                      {ward && (
                        <button
                          type="button"
                          disabled={wardSaving}
                          onClick={() => void removeWard(ward)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          {wardRemoveId === ward.id
                            ? "Tap again"
                            : "Remove ward"}
                        </button>
                      )}
                    </div>
                  ),
                }
              : {})}
          >
            {ward?.notes && (
              <p className="mb-3 text-xs text-muted-foreground">{ward.notes}</p>
            )}

            {wardBeds.length === 0 ? (
              <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                No beds in this ward yet.
                {canManageWards ? " Use the Bed button to add one." : ""}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {wardBeds.map((bed) => {
                  const isInactive = bed.status !== "active";
                  const isOccupied =
                    Boolean(bed.patient) || bed.manuallyOccupied;
                  const tone = isInactive
                    ? "border-dashed border-border bg-muted/40 text-muted-foreground"
                    : isOccupied
                      ? "border-primary/40 bg-secondary text-secondary-foreground"
                      : "border-border bg-card text-foreground hover:bg-accent";
                  return (
                    <button
                      key={bed.bedId}
                      type="button"
                      onClick={() => canEdit && beginEdit(bed)}
                      disabled={!canEdit}
                      aria-label={
                        canEdit
                          ? `Edit bed ${bed.bedCode}`
                          : `Bed ${bed.bedCode}`
                      }
                      className={`min-w-0 rounded-xl border p-3 text-left transition disabled:cursor-default ${tone}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold">
                          {bed.bedCode}
                        </span>
                        {canEdit && (
                          <Pencil
                            aria-hidden="true"
                            className="size-3 shrink-0 opacity-60"
                          />
                        )}
                      </span>
                      <span className="mt-1 block truncate text-[11px]">
                        {isInactive
                          ? "Inactive"
                          : (bed.patient ??
                            (bed.manuallyOccupied ? "Occupied" : "Available"))}
                      </span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide opacity-70">
                        {humanise(bed.bedType)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {editingBed?.ward === wardName && draft && (
              <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-medium text-muted-foreground">
                  Bed code
                  <input
                    value={draft.bedCode}
                    onChange={(event) =>
                      setDraft({ ...draft, bedCode: event.currentTarget.value })
                    }
                    disabled={saving}
                    className={fieldClass}
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  Ward
                  <input
                    value={draft.ward}
                    onChange={(event) =>
                      setDraft({ ...draft, ward: event.currentTarget.value })
                    }
                    disabled={saving}
                    className={fieldClass}
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  Bed type
                  <input
                    value={draft.bedType}
                    onChange={(event) =>
                      setDraft({ ...draft, bedType: event.currentTarget.value })
                    }
                    disabled={saving}
                    className={fieldClass}
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  Availability
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft({ ...draft, status: event.currentTarget.value })
                    }
                    disabled={saving}
                    className={fieldClass}
                  >
                    {BED_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {humanise(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end text-xs font-medium text-muted-foreground sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.occupied}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        occupied: event.currentTarget.checked,
                      })
                    }
                    disabled={saving || Boolean(editingBed.patient)}
                    className="size-4 rounded border-input"
                  />
                  Mark this bed as occupied
                  {editingBed.patient ? " (set by the patient stay)" : ""}
                </label>
                <div className="flex gap-2 sm:col-span-2 xl:col-span-4">
                  <button
                    type="button"
                    onClick={() => void saveBed(editingBed)}
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Save bed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setDraft(null);
                    }}
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                  >
                    <X className="size-4" /> Cancel
                  </button>
                  {ctx.role === "hospital_admin" && (
                    <button
                      type="button"
                      onClick={() => void removeBed(editingBed)}
                      disabled={saving || Boolean(editingBed.patient)}
                      title={
                        editingBed.patient
                          ? "Discharge or transfer the patient before removing this bed"
                          : undefined
                      }
                      className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                      {removeArmedId === editingBed.bedId
                        ? "Tap again to confirm"
                        : "Remove bed"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
