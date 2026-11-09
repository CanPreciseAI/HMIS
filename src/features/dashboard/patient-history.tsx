import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import {
  formatDate,
  loadPatientClinicalHistory,
  loadPatientHistoryOptions,
  type PatientClinicalHistory,
  type PatientHistoryOption,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

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
 * A patient's clinical past in one place: every medicine they were prescribed,
 * the visits and admissions they went through, their diagnoses and results.
 * The doctor picks any active patient in the hospital and reads the record
 * before writing a new prescription.
 */
export function PatientHistoryPanel({ ctx }: { ctx: StaffContext }) {
  const [patients, setPatients] = useState<PatientHistoryOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [history, setHistory] = useState<PatientClinicalHistory | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingPatients(true);
    void loadPatientHistoryOptions(ctx)
      .then((rows) => {
        if (cancelled) return;
        setPatients(rows);
        setPatientId((current) => current || rows[0]?.id || "");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load the patient list.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingPatients(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  useEffect(() => {
    if (!patientId) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    setError("");
    void loadPatientClinicalHistory(ctx, patientId)
      .then((result) => {
        if (cancelled) return;
        setHistory(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setHistory(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load this patient's history.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, patientId]);

  const age = history ? ageLabel(history.patient.dateOfBirth) : null;

  return (
    <Panel
      title="Patient history"
      subtitle="Pick a patient to read their medication history and everything they have been through at this hospital."
      action={
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <History className="size-4" aria-hidden="true" />
        </span>
      }
    >
      <div className="grid gap-3 sm:max-w-md">
        <label className="text-xs font-medium text-foreground">
          Patient
          <select
            value={patientId}
            onChange={(event) => setPatientId(event.currentTarget.value)}
            disabled={loadingPatients || patients.length === 0}
            className={fieldClass}
          >
            {patients.length === 0 && (
              <option value="">
                {loadingPatients ? "Loading patients…" : "No active patients"}
              </option>
            )}
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name} · {patient.number}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loadingHistory && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading the patient's record…
        </p>
      )}

      {!loadingHistory && !history && !error && (
        <div className="mt-4">
          <EmptyState
            icon={History}
            title="No patient selected"
            description="Choose a patient to see their medication history, visits, diagnoses and results."
          />
        </div>
      )}

      {history && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
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
                <ul className="divide-y divide-border rounded-xl border border-border">
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
                <ul className="divide-y divide-border rounded-xl border border-border">
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
                <ul className="divide-y divide-border rounded-xl border border-border">
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
                <ul className="divide-y divide-border rounded-xl border border-border">
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
    </Panel>
  );
}
