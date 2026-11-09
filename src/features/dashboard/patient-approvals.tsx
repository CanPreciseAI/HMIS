import { useEffect, useState } from "react";
import { Check, Loader2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  approvePatientRegistration,
  loadInvoicePatientOptions,
  rejectPatientRegistration,
  type InvoicePatientOption,
  type PatientRegistrationRequest,
  type StaffContext,
} from "./data";
import { EmptyState, Panel } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

/**
 * Patient portal accounts start as pending. Reception links each one to a
 * patient record (new or existing) before the patient can see their dashboard.
 */
export function PatientApprovals({
  ctx,
  initialRows,
}: {
  ctx: StaffContext;
  initialRows: PatientRegistrationRequest[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [openId, setOpenId] = useState<string | null>(null);
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [existingPatientId, setExistingPatientId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState("female");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    let cancelled = false;
    void loadInvoicePatientOptions(ctx)
      .then((options) => {
        if (!cancelled) setPatients(options);
      })
      .catch(() => {
        if (!cancelled) setPatients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  async function approve(row: PatientRegistrationRequest) {
    if (!existingPatientId && (!dateOfBirth || !sex)) {
      toast.error(
        "Enter the patient's date of birth and sex, or link an existing patient.",
      );
      return;
    }
    setBusyId(row.userId);
    try {
      await approvePatientRegistration(ctx, row, {
        patientId: existingPatientId || null,
        dateOfBirth: dateOfBirth || null,
        sex: sex || null,
      });
      setRows((current) =>
        current.filter((item) => item.userId !== row.userId),
      );
      setOpenId(null);
      setExistingPatientId("");
      setDateOfBirth("");
      setSex("female");
      toast.success(`${row.fullName} approved — their dashboard is now open`);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not approve this registration.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function decline(row: PatientRegistrationRequest) {
    setBusyId(row.userId);
    try {
      await rejectPatientRegistration(row);
      setRows((current) =>
        current.filter((item) => item.userId !== row.userId),
      );
      if (openId === row.userId) setOpenId(null);
      toast.success(`${row.fullName} was declined`);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not decline this registration.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Patients waiting for approval"
      subtitle="Patient accounts stay locked until reception approves them and links a patient record."
      {...(rows.length
        ? {
            action: (
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                {rows.length} waiting
              </span>
            ),
          }
        : {})}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No patients waiting"
          description="New patient sign-ups will appear here for reception to approve."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.userId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {row.fullName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.phone} · registered{" "}
                    {new Date(row.registeredAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenId((current) =>
                        current === row.userId ? null : row.userId,
                      )
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    <Check className="size-3.5" />
                    {openId === row.userId ? "Hide" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void decline(row)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <X className="size-3.5" /> Decline
                  </button>
                </div>
              </div>

              {openId === row.userId && (
                <div className="mt-3 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs font-medium text-muted-foreground sm:col-span-2 xl:col-span-4">
                    Link to an existing patient record (optional)
                    <select
                      value={existingPatientId}
                      onChange={(event) =>
                        setExistingPatientId(event.currentTarget.value)
                      }
                      disabled={busyId !== null}
                      className={fieldClass}
                    >
                      <option value="">
                        No — create a new patient record below
                      </option>
                      {patients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                          {patient.name} · {patient.number}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!existingPatientId && (
                    <>
                      <label className="text-xs font-medium text-muted-foreground">
                        Date of birth
                        <input
                          type="date"
                          required
                          value={dateOfBirth}
                          onChange={(event) =>
                            setDateOfBirth(event.currentTarget.value)
                          }
                          disabled={busyId !== null}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-xs font-medium text-muted-foreground">
                        Sex
                        <select
                          value={sex}
                          onChange={(event) =>
                            setSex(event.currentTarget.value)
                          }
                          disabled={busyId !== null}
                          className={fieldClass}
                        >
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </label>
                    </>
                  )}
                  <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void approve(row)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {busyId === row.userId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UserCheck className="size-4" />
                      )}
                      {busyId === row.userId
                        ? "Approving…"
                        : "Approve and open dashboard"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      disabled={busyId !== null}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                    >
                      <X className="size-4" /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
