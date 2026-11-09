import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BedDouble, Loader2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import {
  admitPatientToWard,
  formatDate,
  loadFacilityWardPatients,
  loadFacilityWardStaff,
  loadInvoicePatientOptions,
  loadWardBeds,
  type InvoicePatientOption,
  type StaffContext,
  type WardBed,
  type WardPatientRow,
  type WardStaffOption,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

/**
 * Admission desk for reception: choose the patient, the ward and bed, the
 * doctor handling them and, optionally, the nurse in charge. The admission is
 * the same row the ward board, patient flow, nursing count and the doctor's
 * patient history read.
 */
export function ReceptionAdmissionsPanel({ ctx }: { ctx: StaffContext }) {
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [beds, setBeds] = useState<WardBed[]>([]);
  const [staff, setStaff] = useState<WardStaffOption[]>([]);
  const [inpatients, setInpatients] = useState<WardPatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [admitting, setAdmitting] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [ward, setWard] = useState("");
  const [bedId, setBedId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [nurseId, setNurseId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [patientRows, bedRows, staffRows, inpatientRows] =
        await Promise.all([
          loadInvoicePatientOptions(ctx),
          loadWardBeds(ctx),
          loadFacilityWardStaff(ctx),
          loadFacilityWardPatients(ctx),
        ]);
      setPatients(patientRows);
      setBeds(bedRows);
      setStaff(staffRows);
      setInpatients(inpatientRows);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the admission desk.",
      );
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const freeBeds = beds.filter(
    (bed) => bed.status === "active" && !bed.patient && !bed.manuallyOccupied,
  );
  const wards = [...new Set(freeBeds.map((bed) => bed.ward))].sort();
  const wardBeds = freeBeds.filter((bed) => bed.ward === ward);
  const doctors = staff.filter((person) => person.role === "doctor");
  const nurses = staff.filter((person) => person.role === "nurse");

  async function admit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId || !bedId || !providerId) {
      toast.error("Choose the patient, the bed and the doctor handling them.");
      return;
    }

    setAdmitting(true);
    try {
      await admitPatientToWard({
        patientId,
        bedId,
        nurseId: nurseId || null,
        providerId,
      });
      toast.success("Patient admitted · the ward and doctor now see them");
      setPatientId("");
      setWard("");
      setBedId("");
      setProviderId("");
      setNurseId("");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not admit the patient.",
      );
    } finally {
      setAdmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Admit a patient"
        subtitle="Reception admits a patient into a bed and names the doctor handling them. The ward board, patient flow, nursing station and the doctor's patient history update from the same admission."
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading beds and staff…
          </p>
        ) : (
          <form
            onSubmit={(event) => void admit(event)}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          >
            <label className="text-xs font-medium text-foreground">
              Patient
              <select
                required
                value={patientId}
                onChange={(event) => setPatientId(event.currentTarget.value)}
                disabled={admitting}
                className={fieldClass}
              >
                <option value="">Choose a patient</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-foreground">
              Ward
              <select
                required
                value={ward}
                onChange={(event) => {
                  setWard(event.currentTarget.value);
                  setBedId("");
                }}
                disabled={admitting || wards.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {wards.length ? "Choose a ward" : "No free beds"}
                </option>
                {wards.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-foreground">
              Bed
              <select
                required
                value={bedId}
                onChange={(event) => setBedId(event.currentTarget.value)}
                disabled={admitting || !ward}
                className={fieldClass}
              >
                <option value="">
                  {ward ? "Choose a bed" : "Choose a ward first"}
                </option>
                {wardBeds.map((bed) => (
                  <option key={bed.bedId} value={bed.bedId}>
                    {bed.bedCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-foreground">
              Doctor handling the patient
              <select
                required
                value={providerId}
                onChange={(event) => setProviderId(event.currentTarget.value)}
                disabled={admitting || doctors.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {doctors.length ? "Choose a doctor" : "No doctors available"}
                </option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-foreground">
              Nurse in charge (optional)
              <select
                value={nurseId}
                onChange={(event) => setNurseId(event.currentTarget.value)}
                disabled={admitting || nurses.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {nurses.length ? "Assign later" : "No nurses available"}
                </option>
                {nurses.map((nurse) => (
                  <option key={nurse.id} value={nurse.id}>
                    {nurse.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2 xl:col-span-5">
              <button
                type="submit"
                disabled={admitting || freeBeds.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {admitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserRoundPlus className="size-4" aria-hidden="true" />
                )}
                Admit patient
              </button>
            </div>
          </form>
        )}
      </Panel>

      <Panel
        title="Patients admitted to the hospital"
        subtitle="Everyone currently in a bed, with the ward, the doctor and the nurse in charge."
      >
        {inpatients.length === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="No admitted patients"
            description="Patients reception admits into a bed will appear here and on the ward board."
          />
        ) : (
          <ul className="divide-y divide-border">
            {inpatients.map((row) => (
              <li
                key={row.assignmentId}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {row.patient} · {row.number}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.ward} · bed {row.bed} · {formatDate(row.admittedAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Doctor: {row.doctor ?? "Not assigned"} · Nurse:{" "}
                    {row.nurse ?? "Not assigned"}
                  </p>
                </div>
                <StatusPill status={row.admissionStatus} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
