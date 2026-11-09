import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, NotebookPen, Send } from "lucide-react";
import { toast } from "sonner";
import {
  loadPrescriptionPatientOptions,
  writeHandoffNote,
  type InvoicePatientOption,
  type StaffContext,
} from "./data";
import { Panel } from "./ui";

const fieldClass =
  "mt-1 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

/**
 * The doctor writes a handoff note for the next shift. It lands on the nursing
 * dashboard's handoff section with the patient, doctor and full note text.
 */
export function HandoffNotePanel({ ctx }: { ctx: StaffContext }) {
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setPatients(await loadPrescriptionPatientOptions(ctx));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load patients.",
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
    if (!patientId) {
      setError("Choose the patient this handoff is about.");
      return;
    }
    if (content.trim().length < 3) {
      setError("Write the handoff details before sending the note.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await writeHandoffNote(patientId, content.trim());
      toast.success("Handoff note sent to the nursing dashboard");
      setContent("");
      setPatientId("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send the handoff note.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Write a handoff note"
      subtitle="Notes you write here appear on the nursing dashboard's handoff section for the next shift."
    >
      {loading ? (
        <div className="grid place-items-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-3">
          <label className="block max-w-md text-xs font-medium text-muted-foreground">
            Patient
            <select
              required
              value={patientId}
              onChange={(event) => setPatientId(event.currentTarget.value)}
              disabled={saving}
              className={`${fieldClass} h-9`}
            >
              <option value="">Select a patient</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.number}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-muted-foreground">
            Handoff details
            <textarea
              required
              value={content}
              onChange={(event) => setContent(event.currentTarget.value)}
              rows={4}
              maxLength={4000}
              placeholder="What the next shift needs to know — condition, pending results, medication changes, what to watch for."
              disabled={saving}
              className={fieldClass}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Signed with your name and visible to nurses in your facility.
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !patientId || content.trim().length < 3}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {saving ? "Sending…" : "Send handoff note"}
            </button>
          </div>
        </form>
      )}

      {!loading && patients.length === 0 && !error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <NotebookPen className="size-3.5" />
          No active patients yet — a note can be written once a patient is
          registered.
        </p>
      )}
    </Panel>
  );
}
