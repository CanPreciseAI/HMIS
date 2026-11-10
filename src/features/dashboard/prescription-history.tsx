import { useEffect, useState } from "react";
import { ClipboardList, Loader2, Stethoscope } from "lucide-react";
import {
  formatDate,
  loadDoctorPrescriptionHistory,
  type DoctorPrescriptionHistoryRow,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

function prescriberDetails(row: DoctorPrescriptionHistoryRow) {
  return [
    row.prescriberName,
    row.prescriberDepartment,
    row.prescriberSpecialization,
    row.prescriberCode ? `ID ${row.prescriberCode}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The doctor's own prescription log. It keeps the full lifecycle visible: the
 * patient, what was prescribed, who sent it, and how much the pharmacy has
 * handed over so far.
 */
export function PrescriptionHistoryPanel({ ctx }: { ctx: StaffContext }) {
  const [rows, setRows] = useState<DoctorPrescriptionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void loadDoctorPrescriptionHistory(ctx)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load your prescription history.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  return (
    <Panel
      title="Prescription history"
      subtitle="Every prescription you have sent to the pharmacy, with the doctor details the pharmacist receives."
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your prescription history…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No prescriptions yet"
          description="Prescriptions you send to the pharmacy will appear here with their dispensing progress."
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-border bg-muted/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {row.patient}
                    {row.patientNumber ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {row.patientNumber}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(row.prescribedAt)} · {row.items.length} medicine
                    {row.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <StatusPill status={row.status} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                  <Stethoscope className="size-3" aria-hidden="true" />
                  {prescriberDetails(row)}
                </span>
              </div>

              <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
                {row.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.medicine}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.dose} · {item.route} · {item.frequency} ·{" "}
                        {item.duration}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.dispensed} of {item.prescribed} dispensed
                        {item.remaining > 0
                          ? ` · ${item.remaining} remaining`
                          : ""}
                      </p>
                    </div>
                    <StatusPill status={item.status} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
