import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Panel } from "@/features/dashboard/ui";
import {
  deletePatientHealthDocument,
  getPatientHealthDocumentUrl,
  uploadPatientHealthDocument,
  type PatientHealthDocument,
} from "@/features/dashboard/health-records-data";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const CATEGORIES = [
  { value: "report", label: "Medical report" },
  { value: "lab-report", label: "Laboratory report" },
  { value: "imaging", label: "Scan or imaging" },
  { value: "prescription", label: "Prescription" },
  { value: "insurance", label: "Insurance paper" },
  { value: "other", label: "Other" },
];

/**
 * Reports the patient uploads themselves. They stay attached to the patient
 * record, so the doctor, nurse and administrator of their current hospital can
 * open them too.
 */
export function PatientHealthDocumentsPanel({
  patientId,
  tenantId,
}: {
  patientId: string;
  tenantId: string;
}) {
  const [documents, setDocuments] = useState<PatientHealthDocument[] | null>(
    null,
  );
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("report");
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("patient_health_documents")
      .select(
        "id, title, category, file_name, file_path, mime_type, file_size, notes, uploader_role, created_at",
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (queryError) {
      setDocuments([]);
      setError(`Could not load your health documents: ${queryError.message}`);
      return;
    }
    setError("");
    setDocuments(
      (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        fileName: row.file_name,
        filePath: row.file_path,
        mimeType: row.mime_type,
        fileSize: row.file_size === null ? null : Number(row.file_size),
        notes: row.notes,
        uploaderRole: row.uploader_role,
        createdAt: row.created_at,
      })),
    );
  }, [patientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      toast.error("Choose a file to upload.");
      return;
    }
    setUploading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Your session expired. Please sign in again.");
      await uploadPatientHealthDocument({
        patientId,
        tenantId,
        userId: user.id,
        role: "patient",
        file,
        title: title || file.name,
        category,
        notes,
      });
      setFile(null);
      setTitle("");
      setNotes("");
      toast.success("Your report was uploaded");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not upload that file.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function open(filePath: string) {
    try {
      const url = await getPatientHealthDocumentUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not open that file.",
      );
    }
  }

  async function remove(id: string, filePath: string) {
    if (!window.confirm("Remove this health document?")) return;
    try {
      await deletePatientHealthDocument({ id, filePath });
      toast.success("Document removed");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not remove that document.",
      );
    }
  }

  return (
    <Panel
      title="Your health documents"
      subtitle="Upload reports, scans or prescriptions so every doctor looking after you can see them."
    >
      <form
        onSubmit={(event) => void upload(event)}
        className="mb-4 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2"
      >
        <label className="text-xs font-medium text-foreground sm:col-span-2">
          File
          <input
            type="file"
            accept=".pdf,image/*,.doc,.docx,.txt"
            onChange={(event) =>
              setFile(event.currentTarget.files?.[0] ?? null)
            }
            className="mt-1 block w-full text-sm text-foreground file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground"
          />
        </label>
        <label className="text-xs font-medium text-foreground">
          Title (optional)
          <input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="e.g. Old discharge summary"
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-medium text-foreground">
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
            className={fieldClass}
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-foreground sm:col-span-2">
          Notes (optional)
          <input
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            placeholder="Anything your care team should know about this file"
            className={fieldClass}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={uploading || !file}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            <Upload className="size-4" />
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {documents === null ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your documents…
        </p>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents uploaded"
          description="Upload old reports or scans to keep them with your health records."
        />
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {document.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {document.fileName} · {document.category} ·{" "}
                  {document.uploaderRole === "patient"
                    ? "Uploaded by you"
                    : "Uploaded by your care team"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void open(document.filePath)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <Download className="size-3.5" /> Open
                </button>
                <button
                  type="button"
                  onClick={() => void remove(document.id, document.filePath)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
