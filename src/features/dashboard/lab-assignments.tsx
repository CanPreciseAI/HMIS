import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ClipboardList,
  FlaskConical,
  Loader2,
  Send,
  TestTubes,
} from "lucide-react";
import { toast } from "sonner";
import {
  createLabAssignment,
  formatDate,
  loadLabAssignmentWorkspace,
  type DoctorData,
  type LabAssignmentPriority,
  type LabAssignmentWorkspace,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const PRIORITIES: { value: LabAssignmentPriority; label: string }[] = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "STAT" },
];

/**
 * Doctors assign selected laboratory tests for a patient to an active lab
 * technician. The created order appears in that technician's sample queue.
 */
export function LabAssignmentsPanel({
  ctx,
  criticalResults,
}: {
  ctx: StaffContext;
  criticalResults: DoctorData["critical"];
}) {
  const [workspace, setWorkspace] = useState<LabAssignmentWorkspace | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [technicianId, setTechnicianId] = useState("");
  const [priority, setPriority] = useState<LabAssignmentPriority>("routine");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setWorkspace(await loadLabAssignmentWorkspace(ctx));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the lab assignment workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId || selectedTestIds.length === 0 || !technicianId) {
      toast.error("Choose a patient, at least one test, and a lab technician.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createLabAssignment({
        patientId,
        testIds: selectedTestIds,
        technicianId,
        priority,
      });
      toast.success(
        `${result.itemCount} test${result.itemCount === 1 ? "" : "s"} assigned to the lab`,
      );
      setPatientId("");
      setSelectedTestIds([]);
      setTechnicianId("");
      setPriority("routine");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not assign the lab tests.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Assign lab tests"
        subtitle="Choose a patient, the tests they need, and the lab technician who will process them."
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading && !workspace ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading patients, tests, and lab technicians…
          </p>
        ) : workspace ? (
          <form
            onSubmit={(event) => void submit(event)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="text-xs font-medium text-foreground">
              Patient
              <select
                required
                value={patientId}
                onChange={(event) => setPatientId(event.currentTarget.value)}
                disabled={submitting || workspace.patients.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {workspace.patients.length
                    ? "Choose a patient"
                    : "No active patients"}
                </option>
                {workspace.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.number}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-foreground">
              Lab technician
              <select
                required
                value={technicianId}
                onChange={(event) => setTechnicianId(event.currentTarget.value)}
                disabled={submitting || workspace.technicians.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {workspace.technicians.length
                    ? "Choose a lab technician"
                    : "No active lab technicians"}
                </option>
                {workspace.technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-foreground">
              Priority
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(
                    event.currentTarget.value as LabAssignmentPriority,
                  )
                }
                disabled={submitting}
                className={fieldClass}
              >
                {PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="sm:col-span-2">
              <legend className="text-xs font-medium text-foreground">
                Tests
              </legend>
              {workspace.tests.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  No active lab tests are in the catalog for this hospital.
                </p>
              ) : (
                <>
                  <div className="mt-1.5 grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-input bg-background p-3 sm:grid-cols-2">
                    {workspace.tests.map((test) => (
                      <label
                        key={test.id}
                        className="flex cursor-pointer items-start gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTestIds.includes(test.id)}
                          onChange={(event) =>
                            setSelectedTestIds((current) =>
                              event.currentTarget.checked
                                ? [...current, test.id]
                                : current.filter((id) => id !== test.id),
                            )
                          }
                          disabled={submitting}
                          className="mt-1 size-4 rounded border-input text-primary focus:ring-ring"
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{test.name}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {test.code} · {test.specimenType}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {selectedTestIds.length} test
                    {selectedTestIds.length === 1 ? "" : "s"} selected
                  </p>
                </>
              )}
            </fieldset>

            <div className="flex justify-end sm:col-span-2">
              <button
                type="submit"
                disabled={
                  submitting ||
                  !patientId ||
                  selectedTestIds.length === 0 ||
                  !technicianId
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
                {submitting ? "Assigning…" : "Assign to lab"}
              </button>
            </div>
          </form>
        ) : null}
      </Panel>

      <Panel
        title="Recent lab assignments"
        subtitle="Tests you have sent to a laboratory technician."
        action={
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <TestTubes className="size-4" aria-hidden="true" />
          </span>
        }
      >
        {workspace && workspace.assignments.length > 0 ? (
          <ul className="divide-y divide-border">
            {workspace.assignments.map((row) => (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.patient} · {row.patientNumber ?? "No MRN"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Assigned to {row.technician} · {formatDate(row.orderedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      status={row.priority === "stat" ? "urgent" : row.priority}
                    />
                    <StatusPill status={row.status} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.tests.length > 0 ? (
                    row.tests.map((test) => (
                      <span
                        key={`${row.id}-${test}`}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {test}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No tests listed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No lab assignments yet"
            description="Patients you assign to the lab will appear here with their tests."
          />
        )}
      </Panel>

      <Panel
        title="Results to review"
        subtitle="Critical laboratory results requiring clinical attention."
        action={
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <FlaskConical className="size-4" aria-hidden="true" />
          </span>
        }
      >
        {criticalResults.length > 0 ? (
          <ul className="divide-y divide-border">
            {criticalResults.map((row) => (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.test} · {row.patient}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.at
                        ? new Date(row.at).toLocaleString()
                        : "Date unavailable"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                      row.acknowledged
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-rose-50 text-rose-700 ring-rose-200"
                    }`}
                  >
                    {row.acknowledged ? "Acknowledged" : "Critical"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {row.value}
                  {row.unit ? ` ${row.unit}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FlaskConical}
            title="No critical results"
            description="Critical laboratory results requiring review will appear here."
          />
        )}
      </Panel>
    </div>
  );
}
