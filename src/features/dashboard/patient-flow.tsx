import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDate,
  humanise,
  type PatientFlowRow,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const ENCOUNTER_STATUSES = ["open", "closed"];
const ADMISSION_STATUSES = ["active", "discharged"];

const selectClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

/**
 * Patient flow for the hospital administrator. Encounters are scoped to the
 * administrator's facility by the loader; each write repeats that scope so a
 * patient record can never be moved across hospitals from the browser.
 */
export function PatientFlowManagement({
  ctx,
  initialRows,
}: {
  ctx: StaffContext;
  initialRows: PatientFlowRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [saving, setSaving] = useState<string | null>(null);

  const openCount = rows.filter((row) => row.encounterStatus === "open").length;
  const admittedCount = rows.filter(
    (row) => row.admissionStatus === "active",
  ).length;

  async function updateEncounterStatus(row: PatientFlowRow, status: string) {
    if (status === row.encounterStatus) return;
    if (!ctx.tenantId || !ctx.facilityId) {
      toast.error("Your workspace is missing its hospital or facility.");
      return;
    }

    setSaving(`encounter:${row.encounterId}`);
    const { data: updated, error } = await supabase
      .from("encounters")
      .update({
        status,
        ended_at: status === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", row.encounterId)
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId)
      .select("id")
      .maybeSingle();
    setSaving(null);
    if (error) {
      toast.error(`Could not update the encounter: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error(
        "Encounter could not be updated. Check your access and try again.",
      );
      return;
    }

    setRows((current) =>
      current.map((item) =>
        item.encounterId === row.encounterId
          ? { ...item, encounterStatus: status }
          : item,
      ),
    );
    toast.success(`${row.patient}'s encounter marked ${humanise(status)}`);
  }

  async function updateAdmissionStatus(row: PatientFlowRow, status: string) {
    if (!row.admissionId || status === row.admissionStatus) return;
    if (!ctx.tenantId) {
      toast.error("Your workspace is missing its hospital ID.");
      return;
    }

    setSaving(`admission:${row.admissionId}`);
    const { data: updated, error } = await supabase
      .from("admissions")
      .update({
        status,
        discharged_at:
          status === "discharged" ? new Date().toISOString() : null,
      })
      .eq("id", row.admissionId)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    setSaving(null);
    if (error) {
      toast.error(`Could not update the admission: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error(
        "Admission could not be updated. Check your access and try again.",
      );
      return;
    }

    setRows((current) =>
      current.map((item) =>
        item.encounterId === row.encounterId
          ? { ...item, admissionStatus: status }
          : item,
      ),
    );
    toast.success(
      status === "discharged"
        ? `${row.patient} discharged`
        : `${row.patient} re-admitted`,
    );
  }

  return (
    <Panel
      title="Patient flow"
      subtitle="Recent patients in your facility · update their encounter and admission status"
    >
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
          {rows.length} recent patients
        </span>
        <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
          {openCount} open encounters
        </span>
        <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
          {admittedCount} admitted
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patients in flow yet"
          description="Encounters created at your facility will appear here with their status."
        />
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <article
              key={row.encounterId}
              className="py-4 first:pt-0 last:pb-0"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {row.patient}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.number ?? "No MRN"} · {humanise(row.encounterType)} ·
                    started {formatDate(row.startedAt)}
                  </p>
                  {row.admittedAt && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Admitted {formatDate(row.admittedAt)}
                      {row.dischargedAt
                        ? ` · discharged ${formatDate(row.dischargedAt)}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill status={row.encounterStatus} />
                  {row.admissionId && row.admissionStatus && (
                    <StatusPill status={row.admissionStatus} />
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
                <label className="text-xs font-medium text-muted-foreground">
                  Encounter status
                  <select
                    value={row.encounterStatus}
                    onChange={(event) =>
                      void updateEncounterStatus(row, event.currentTarget.value)
                    }
                    disabled={saving !== null}
                    className={selectClass}
                  >
                    {ENCOUNTER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {humanise(status)}
                      </option>
                    ))}
                  </select>
                </label>
                {row.admissionId ? (
                  <label className="text-xs font-medium text-muted-foreground">
                    Admission status
                    <select
                      value={row.admissionStatus ?? "active"}
                      onChange={(event) =>
                        void updateAdmissionStatus(
                          row,
                          event.currentTarget.value,
                        )
                      }
                      disabled={saving !== null}
                      className={selectClass}
                    >
                      {ADMISSION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {humanise(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="self-end pb-2 text-xs text-muted-foreground">
                    Not admitted
                  </p>
                )}
              </div>

              {saving === `encounter:${row.encounterId}` ||
              saving === `admission:${row.admissionId}` ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Saving…
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
