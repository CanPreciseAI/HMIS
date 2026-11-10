import { useEffect, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  loadPatientClinicalHistory,
  updateMyPatientEncounterStatus,
  type DoctorEncounterStatus,
  type PatientClinicalHistory,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

export type YourPatientRow = {
  id: string;
  patientId: string;
  name: string;
  number: string | null;
  detail: string;
  status: string;
};

function ageLabel(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) {
    age -= 1;
  }
  return age >= 0 ? `${age} yrs` : null;
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
      {title}
      {typeof count === "number" && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {count}
        </span>
      )}
    </h3>
  );
}

/**
 * The doctor's patient list. Each patient is a dropdown that loads their
 * clinical past only when opened: medicines, visits, diagnoses and results.
 */
export function YourPatientsPanel({
  ctx,
  patients,
  openEncounters,
}: {
  ctx: StaffContext;
  patients: YourPatientRow[];
  openEncounters: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rows, setRows] = useState(patients);
  const [savingId, setSavingId] = useState<string | null>(null);
  const openLabel = `${openEncounters} open encounter${openEncounters === 1 ? "" : "s"}`;

  useEffect(() => {
    setRows(patients);
  }, [patients]);

  async function updateStatus(
    row: YourPatientRow,
    status: DoctorEncounterStatus,
  ) {
    if (status === row.status) return;
    setSavingId(row.id);
    try {
      await updateMyPatientEncounterStatus(row.id, status);
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, status } : item,
        ),
      );
      toast.success(`${row.name}'s visit marked ${status}`);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not update the patient status.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Panel
      id="patients"
      title="Your patients"
      subtitle={`Open a patient to review their history, or update the status of their current visit. Marking it Checked adds the ₹500 consultation fee to the billing ledger${
        openEncounters ? ` · ${openLabel}` : ""
      }.`}
      action={
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <History className="size-4" aria-hidden="true" />
        </span>
      }
    >
      {patients.length === 0 ? (
        <EmptyState
          icon={History}
          title="No encounters yet"
          description="Patients you open an encounter for will be listed here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const expanded = expandedId === row.patientId;
            const panelId = `patient-history-${row.patientId}`;
            return (
              <li key={row.patientId}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === row.patientId ? null : row.patientId,
                      )
                    }
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg py-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {row.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.number ?? "No MRN"} · {row.detail}
                      </p>
                    </div>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  <label className="flex shrink-0 items-center gap-1.5">
                    <span className="sr-only">Visit status for {row.name}</span>
                    {savingId === row.id && (
                      <Loader2
                        className="size-3.5 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <select
                      value={row.status}
                      onChange={(event) =>
                        void updateStatus(
                          row,
                          event.currentTarget.value as DoctorEncounterStatus,
                        )
                      }
                      disabled={savingId !== null}
                      aria-label={`Visit status for ${row.name}`}
                      title="Update visit status"
                      className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                    >
                      <option value="open">Open</option>
                      <option value="checked">Checked</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                </div>
                {expanded && (
                  <div id={panelId} className="pb-4">
                    <PatientHistoryDetails
                      ctx={ctx}
                      patientId={row.patientId}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function PatientHistoryDetails({
  ctx,
  patientId,
}: {
  ctx: StaffContext;
  patientId: string;
}) {
  const [history, setHistory] = useState<PatientClinicalHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHistory(null);
    void loadPatientClinicalHistory(ctx, patientId)
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load this patient's history.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, patientId]);

  const age = history ? ageLabel(history.patient.dateOfBirth) : null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="size-4 text-primary" aria-hidden="true" />
        Clinical history
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading the patient's record…
        </p>
      )}

      {!loading && !history && !error && (
        <EmptyState
          icon={History}
          title="No history available"
          description="This patient does not have any clinical records yet."
        />
      )}

      {history && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <span className="text-sm font-semibold text-foreground">
              {history.patient.name}
            </span>
            <span>{history.patient.number}</span>
            {age && <span>· {age}</span>}
            {history.patient.sex && <span>· {history.patient.sex}</span>}
            {history.allergies.length > 0 ? (
              history.allergies.map((allergy) => (
                <span
                  key={`${allergy.substance}-${allergy.reaction}`}
                  className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset"
                >
                  {allergy.substance} · {allergy.severity}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                No known allergies
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-5 xl:grid-cols-2">
            <div>
              <SectionHeading
                title="Medication history"
                count={history.medications.length}
              />
              {history.medications.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  No medicines have been prescribed to this patient yet.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {history.medications.map((row) => (
                    <li key={row.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {row.medicine}
                        </p>
                        <StatusPill status={row.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.dose} · {row.route} · {row.frequency} ·{" "}
                        {row.duration}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {row.prescribedAt
                          ? `Prescribed ${formatDate(row.prescribedAt)}`
                          : "Prescribed"}
                        {" · "}
                        {row.quantityDispensed} of {row.quantityPrescribed}{" "}
                        dispensed
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <SectionHeading
                title="Visits and admissions"
                count={history.events.length}
              />
              {history.events.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  No visits, admissions or appointments recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {history.events.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {row.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(row.at)}
                          {row.detail ? ` · ${row.detail}` : ""}
                        </p>
                      </div>
                      <StatusPill status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <SectionHeading
                title="Diagnoses"
                count={history.diagnoses.length}
              />
              {history.diagnoses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  No diagnoses recorded for this patient.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {history.diagnoses.map((row) => (
                    <li key={row.id} className="px-3 py-2.5">
                      <p className="text-sm font-medium text-foreground">
                        {row.description}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.code} · {row.type.replaceAll("_", " ")} ·{" "}
                        {formatDate(row.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <SectionHeading
                title="Laboratory results"
                count={history.labs.length}
              />
              {history.labs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  No laboratory results recorded for this patient.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {history.labs.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {row.test}
                        </p>
                        <p className="mt-0.5 text-sm text-foreground">
                          {row.value}
                          {row.unit ? ` ${row.unit}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatDate(row.at)}
                        </p>
                      </div>
                      <StatusPill status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
