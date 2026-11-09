import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BedDouble, Loader2, UserRoundPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  admitPatientToWard,
  formatDate,
  loadFacilityWardPatients,
  loadFacilityWardStaff,
  loadInvoicePatientOptions,
  loadWardBeds,
  updateWardAssignment,
  type InvoicePatientOption,
  type StaffContext,
  type WardBed,
  type WardPatientRow,
  type WardRow,
  type WardStaffOption,
} from "./data";
import { EmptyState, Panel, StatusPill, WardMeter } from "./ui";

const selectClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

/**
 * Ward capacity: occupancy, the patients in beds, and who is looking after
 * each one. Ward staff admit a patient into a bed with the nurse in charge and
 * the doctor handling them, then keep that care team up to date.
 */
export function WardCapacityManagement({
  ctx,
  wards,
  patients,
  canEdit,
}: {
  ctx: StaffContext;
  wards: WardRow[];
  patients: WardPatientRow[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(patients);
  const [saving, setSaving] = useState<string | null>(null);

  const [patientOptions, setPatientOptions] = useState<InvoicePatientOption[]>(
    [],
  );
  const [beds, setBeds] = useState<WardBed[]>([]);
  const [staff, setStaff] = useState<WardStaffOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(canEdit);

  const [admitPatientId, setAdmitPatientId] = useState("");
  const [admitWard, setAdmitWard] = useState("");
  const [admitBedId, setAdmitBedId] = useState("");
  const [admitNurseId, setAdmitNurseId] = useState("");
  const [admitProviderId, setAdmitProviderId] = useState("");
  const [admitting, setAdmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBedId, setEditBedId] = useState("");
  const [editNurseId, setEditNurseId] = useState("");
  const [editProviderId, setEditProviderId] = useState("");

  const refreshRows = useCallback(async () => {
    if (!canEdit) return;
    try {
      setRows(await loadFacilityWardPatients(ctx));
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not refresh the patients in wards.",
      );
    }
  }, [canEdit, ctx]);

  const refreshOptions = useCallback(async () => {
    if (!canEdit) return;
    setOptionsLoading(true);
    try {
      const [patientRows, bedRows, staffRows] = await Promise.all([
        loadInvoicePatientOptions(ctx),
        loadWardBeds(ctx),
        loadFacilityWardStaff(ctx),
      ]);
      setPatientOptions(patientRows);
      setBeds(bedRows);
      setStaff(staffRows);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not load the ward assignment options.",
      );
    } finally {
      setOptionsLoading(false);
    }
  }, [canEdit, ctx]);

  useEffect(() => {
    void refreshOptions();
  }, [refreshOptions]);

  useEffect(() => {
    setRows(patients);
  }, [patients]);

  const occupiedByWard = new Map<string, number>();
  for (const row of rows) {
    occupiedByWard.set(row.ward, (occupiedByWard.get(row.ward) ?? 0) + 1);
  }
  const bedsTotal = wards.reduce((sum, ward) => sum + ward.total, 0);
  const bedsOccupied = rows.length;

  const nurses = staff.filter((person) => person.role === "nurse");
  const doctors = staff.filter((person) => person.role === "doctor");
  const freeBeds = beds.filter(
    (bed) => bed.status === "active" && !bed.patient && !bed.manuallyOccupied,
  );
  const admitWardBeds = freeBeds.filter((bed) => bed.ward === admitWard);

  async function dischargePatient(row: WardPatientRow) {
    if (!ctx.tenantId) {
      toast.error("Your workspace is missing its hospital ID.");
      return;
    }

    setSaving(row.assignmentId);
    const endedAt = new Date().toISOString();
    const { data: admissionUpdated, error } = await supabase
      .from("admissions")
      .update({ status: "discharged", discharged_at: endedAt })
      .eq("id", row.admissionId)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error || !admissionUpdated) {
      setSaving(null);
      toast.error(
        error
          ? `Could not discharge the patient: ${error.message}`
          : "Admission could not be updated. Check your access and try again.",
      );
      return;
    }

    const { data: assignmentUpdated, error: assignmentError } = await supabase
      .from("bed_assignments")
      .update({ status: "ended", end_at: endedAt })
      .eq("id", row.assignmentId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    setSaving(null);
    if (assignmentError || !assignmentUpdated) {
      toast.error(
        assignmentError
          ? `Patient discharged, but the bed could not be freed: ${assignmentError.message}`
          : "Patient discharged, but the bed assignment could not be closed.",
      );
      return;
    }

    setRows((current) =>
      current.filter((item) => item.assignmentId !== row.assignmentId),
    );
    toast.success(`${row.patient} discharged · room ${row.bed} is free`);
    await refreshOptions();
  }

  async function admit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admitPatientId || !admitBedId || !admitProviderId) {
      toast.error("Choose the patient, the bed and the doctor handling them.");
      return;
    }

    setAdmitting(true);
    try {
      await admitPatientToWard({
        patientId: admitPatientId,
        bedId: admitBedId,
        nurseId: admitNurseId || null,
        providerId: admitProviderId,
      });
      toast.success("Patient admitted to the ward");
      setAdmitPatientId("");
      setAdmitWard("");
      setAdmitBedId("");
      setAdmitNurseId("");
      setAdmitProviderId("");
      await Promise.all([refreshRows(), refreshOptions()]);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not admit the patient.",
      );
    } finally {
      setAdmitting(false);
    }
  }

  function startEditing(row: WardPatientRow) {
    setEditingId(row.assignmentId);
    setEditBedId(row.bedId);
    setEditNurseId(row.nurseId ?? "");
    setEditProviderId(row.providerId ?? "");
  }

  async function saveAssignment(row: WardPatientRow) {
    if (!editBedId || !editProviderId) {
      toast.error("Choose the bed and the doctor handling the patient.");
      return;
    }

    setSaving(row.assignmentId);
    try {
      await updateWardAssignment({
        assignmentId: row.assignmentId,
        bedId: editBedId,
        nurseId: editNurseId || null,
        providerId: editProviderId,
      });
      toast.success(`${row.patient}'s ward assignment updated`);
      setEditingId(null);
      await Promise.all([refreshRows(), refreshOptions()]);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not update the ward assignment.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Ward-by-ward occupancy"
        subtitle={`${bedsOccupied} of ${bedsTotal} active beds are occupied`}
      >
        {wards.length ? (
          <div className="space-y-5">
            {wards.map((ward) => (
              <WardMeter
                key={ward.ward}
                ward={ward.ward}
                total={ward.total}
                occupied={occupiedByWard.get(ward.ward) ?? 0}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BedDouble}
            title="No ward data available"
            description="Active beds in your facility will appear here."
          />
        )}
      </Panel>

      {canEdit && (
        <Panel
          title="Admit a patient to a ward"
          subtitle="Nurses and doctors pick the room, the nurse in charge and the doctor handling the patient."
        >
          {optionsLoading ? (
            <div className="grid place-items-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <form
              onSubmit={(event) => void admit(event)}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Patient
                <select
                  required
                  value={admitPatientId}
                  onChange={(event) =>
                    setAdmitPatientId(event.currentTarget.value)
                  }
                  disabled={admitting}
                  className={selectClass}
                >
                  <option value="">Select a patient</option>
                  {patientOptions.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} · {patient.number}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Ward
                <select
                  value={admitWard}
                  onChange={(event) => {
                    setAdmitWard(event.currentTarget.value);
                    setAdmitBedId("");
                  }}
                  disabled={admitting}
                  className={selectClass}
                >
                  <option value="">Select a ward</option>
                  {wards.map((ward) => (
                    <option key={ward.ward} value={ward.ward}>
                      {ward.ward} ·{" "}
                      {ward.total - (occupiedByWard.get(ward.ward) ?? 0)} free
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Room
                <select
                  required
                  value={admitBedId}
                  onChange={(event) => setAdmitBedId(event.currentTarget.value)}
                  disabled={admitting || !admitWard}
                  className={selectClass}
                >
                  <option value="">
                    {admitWard ? "Select a free room" : "Choose a ward first"}
                  </option>
                  {admitWardBeds.map((bed) => (
                    <option key={bed.bedId} value={bed.bedId}>
                      {bed.bedCode} · {bed.bedType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Nurse in charge (optional)
                <select
                  value={admitNurseId}
                  onChange={(event) =>
                    setAdmitNurseId(event.currentTarget.value)
                  }
                  disabled={admitting}
                  className={selectClass}
                >
                  <option value="">Unassigned</option>
                  {nurses.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Doctor handling the patient
                <select
                  required
                  value={admitProviderId}
                  onChange={(event) =>
                    setAdmitProviderId(event.currentTarget.value)
                  }
                  disabled={admitting}
                  className={selectClass}
                >
                  <option value="">Select a doctor</option>
                  {doctors.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={admitting || !admitPatientId || !admitBedId}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {admitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserRoundPlus className="size-4" />
                  )}
                  {admitting ? "Admitting…" : "Admit patient"}
                </button>
              </div>
            </form>
          )}
          {!optionsLoading && freeBeds.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Every room is occupied right now — discharge a patient or add a
              room before admitting someone new.
            </p>
          )}
        </Panel>
      )}

      <Panel
        title="Patients in wards"
        subtitle={
          canEdit
            ? "Admitted patients, their room, nurse and doctor · discharging frees the room"
            : "Admitted patients, their room, nurse and doctor"
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients in beds"
            description="Patients with an active bed assignment will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <article
                key={row.assignmentId}
                className="py-4 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {row.patient}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.number ?? "No MRN"} · {row.ward} · room {row.bed}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.doctor
                        ? `Doctor: ${row.doctor}`
                        : "No doctor assigned"}
                      {" · "}
                      {row.nurse ? `Nurse: ${row.nurse}` : "No nurse assigned"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Admitted {formatDate(row.admittedAt)} · in room since{" "}
                      {formatDate(row.startAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusPill status={row.admissionStatus} />
                    {canEdit && editingId !== row.assignmentId && (
                      <button
                        type="button"
                        onClick={() => startEditing(row)}
                        disabled={saving !== null}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                      >
                        Change room or care team
                      </button>
                    )}
                  </div>
                </div>

                {canEdit && editingId === row.assignmentId && (
                  <div className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="min-w-0 text-xs font-medium text-muted-foreground">
                      Room
                      <select
                        value={editBedId}
                        onChange={(event) =>
                          setEditBedId(event.currentTarget.value)
                        }
                        disabled={saving !== null}
                        className={selectClass}
                      >
                        <option value={row.bedId}>{row.bed} (current)</option>
                        {freeBeds.map((bed) => (
                          <option key={bed.bedId} value={bed.bedId}>
                            {bed.bedCode} · {bed.ward}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 text-xs font-medium text-muted-foreground">
                      Nurse in charge
                      <select
                        value={editNurseId}
                        onChange={(event) =>
                          setEditNurseId(event.currentTarget.value)
                        }
                        disabled={saving !== null}
                        className={selectClass}
                      >
                        <option value="">Unassigned</option>
                        {nurses.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 text-xs font-medium text-muted-foreground">
                      Doctor handling the patient
                      <select
                        value={editProviderId}
                        onChange={(event) =>
                          setEditProviderId(event.currentTarget.value)
                        }
                        disabled={saving !== null}
                        className={selectClass}
                      >
                        <option value="">Select a doctor</option>
                        {doctors.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => void saveAssignment(row)}
                        disabled={saving !== null}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saving === row.assignmentId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={saving !== null}
                        className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {canEdit && editingId !== row.assignmentId && (
                  <div className="mt-3 max-w-xs">
                    <label className="text-xs font-medium text-muted-foreground">
                      Admission status
                      <select
                        value={row.admissionStatus}
                        onChange={(event) => {
                          if (event.currentTarget.value === "discharged") {
                            void dischargePatient(row);
                          }
                        }}
                        disabled={saving !== null}
                        className={selectClass}
                      >
                        <option value="active">Active</option>
                        <option value="discharged">Discharged</option>
                      </select>
                    </label>
                    {saving === row.assignmentId && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Saving…
                      </p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
