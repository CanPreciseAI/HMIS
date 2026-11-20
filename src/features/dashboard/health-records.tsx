import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Download,
  FileUp,
  Loader2,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  deletePatientHealthDocument,
  getPatientHealthDocumentUrl,
  loadPatientHealthRecord,
  recordPatientDiagnosis,
  uploadPatientHealthDocument,
  type PatientHealthRecord,
} from "./health-records-data";
import {
  formatDate,
  loadInvoicePatientOptions,
  type InvoicePatientOption,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

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

const DIAGNOSIS_TYPES = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "provisional", label: "Provisional" },
  { value: "differential", label: "Differential" },
];

/**
 * Patient health records for clinical and administrative staff: previous
 * conditions, allergies and files uploaded by the patient or the care team.
 * Everything follows the patient's current hospital.
 */
export function PatientHealthRecords({ ctx }: { ctx: StaffContext }) {
  const [patients, setPatients] = useState<InvoicePatientOption[] | null>(null);
  const [patientId, setPatientId] = useState("");
  const [record, setRecord] = useState<PatientHealthRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("report");
  const [notes, setNotes] = useState("");

  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [diagnosisDescription, setDiagnosisDescription] = useState("");
  const [diagnosisType, setDiagnosisType] = useState("primary");

  useEffect(() => {
    void loadInvoicePatientOptions(ctx)
      .then(setPatients)
      .catch((cause: unknown) => {
        setPatients([]);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load the hospital's patients.",
        );
      });
  }, [ctx]);

  const refresh = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError("");
    try {
      setRecord(await loadPatientHealthRecord(patientId));
    } catch (cause) {
      setRecord(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load this patient's health records.",
      );
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    setRecord(null);
    void refresh();
  }, [refresh]);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !patientId) {
      toast.error("Choose a file to upload.");
      return;
    }
    if (!ctx.tenantId) {
      toast.error("Your workspace is missing its hospital ID.");
      return;
    }
    setUploading(true);
    try {
      await uploadPatientHealthDocument({
        patientId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        file,
        title: title || file.name,
        category,
        notes,
      });
      setFile(null);
      setTitle("");
      setNotes("");
      toast.success("Health document uploaded");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not upload that document.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(filePath: string) {
    try {
      const url = await getPatientHealthDocumentUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not open that file.",
      );
    }
  }

  async function removeDocument(id: string, filePath: string) {
    if (!window.confirm("Remove this health document?")) return;
    try {
      await deletePatientHealthDocument({ id, filePath });
      toast.success("Health document removed");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not remove that document.",
      );
    }
  }

  async function submitDiagnosis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId || !diagnosisCode.trim()) {
      toast.error("Enter a diagnosis code or name.");
      return;
    }
    setDiagnosing(true);
    try {
      await recordPatientDiagnosis({
        patientId,
        code: diagnosisCode,
        description: diagnosisDescription,
        type: diagnosisType,
      });
      setDiagnosisCode("");
      setDiagnosisDescription("");
      setDiagnosisType("primary");
      toast.success("Diagnosis added to the patient's health information");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not record the diagnosis.",
      );
    } finally {
      setDiagnosing(false);
    }
  }

  const canRecordDiagnosis = ctx.role === "doctor";

  return (
    <div className="space-y-5">
      <Panel
        title="Patient health records"
        subtitle="Previous conditions, allergies and reports that follow the patient across hospitals."
      >
        <label className="block text-xs font-medium text-foreground">
          Patient
          <select
            value={patientId}
            onChange={(event) => setPatientId(event.currentTarget.value)}
            className={fieldClass}
          >
            <option value="">
              {patients === null
                ? "Loading patients…"
                : patients.length
                  ? "Choose a patient"
                  : "No active patients"}
            </option>
            {(patients ?? []).map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name} · {patient.number ?? "No MRN"}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading health records…
          </p>
        )}
      </Panel>

      {!patientId ? (
        <Panel title="Health information" subtitle="Nothing selected yet">
          <EmptyState
            icon={Stethoscope}
            title="Choose a patient"
            description="Their conditions, allergies and uploaded reports will appear here."
          />
        </Panel>
      ) : (
        record && (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel
                title="Previous conditions"
                subtitle={`${record.conditions.length} recorded diagnoses`}
              >
                {record.conditions.length ? (
                  <ul className="divide-y divide-border">
                    {record.conditions.map((condition) => (
                      <li
                        key={condition.id}
                        className="py-3 first:pt-0 last:pb-0"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {condition.description}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {condition.code} · {condition.type} ·{" "}
                          {formatDate(condition.at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={Stethoscope}
                    title="No conditions recorded"
                    description="Diagnoses recorded by doctors are added here automatically."
                  />
                )}
              </Panel>

              <Panel
                title="Allergies"
                subtitle={`${record.allergies.length} recorded allergies`}
              >
                {record.allergies.length ? (
                  <ul className="divide-y divide-border">
                    {record.allergies.map((allergy) => (
                      <li
                        key={allergy.id}
                        className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {allergy.substance}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {allergy.reaction} · {allergy.severity}
                          </p>
                        </div>
                        <StatusPill status={allergy.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={ShieldAlert}
                    title="No allergies recorded"
                    description="Allergies entered by the care team will be listed here."
                  />
                )}
              </Panel>
            </div>

            {canRecordDiagnosis && (
              <Panel
                title="Add a diagnosis"
                subtitle="Saved to the patient's health information and visible to their current hospital."
              >
                <form
                  onSubmit={(event) => void submitDiagnosis(event)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <label className="text-xs font-medium text-foreground">
                    Code or condition
                    <input
                      required
                      value={diagnosisCode}
                      onChange={(event) =>
                        setDiagnosisCode(event.currentTarget.value)
                      }
                      placeholder="e.g. E11.9 or Type 2 diabetes"
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-medium text-foreground">
                    Type
                    <select
                      value={diagnosisType}
                      onChange={(event) =>
                        setDiagnosisType(event.currentTarget.value)
                      }
                      className={fieldClass}
                    >
                      {DIAGNOSIS_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-foreground sm:col-span-2">
                    Description (optional)
                    <input
                      value={diagnosisDescription}
                      onChange={(event) =>
                        setDiagnosisDescription(event.currentTarget.value)
                      }
                      placeholder="Plain-language description"
                      className={fieldClass}
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={diagnosing}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      <Stethoscope className="size-4" />
                      {diagnosing ? "Saving…" : "Add diagnosis"}
                    </button>
                  </div>
                </form>
              </Panel>
            )}

            <Panel
              title="Health documents"
              subtitle={`${record.documents.length} uploaded reports and files`}
            >
              <form
                onSubmit={(event) => void submitUpload(event)}
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
                    placeholder="e.g. Discharge summary"
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
                    placeholder="Anything the patient or care team should know"
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
                    {uploading ? "Uploading…" : "Upload document"}
                  </button>
                </div>
              </form>

              {record.documents.length ? (
                <ul className="divide-y divide-border">
                  {record.documents.map((document) => (
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
                          {document.uploaderRole.replaceAll("_", " ")} ·{" "}
                          {formatDate(document.createdAt)}
                        </p>
                        {document.notes && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {document.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openDocument(document.filePath)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          <Download className="size-3.5" /> Open
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void removeDocument(document.id, document.filePath)
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" /> Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={FileUp}
                  title="No documents yet"
                  description="Files uploaded by the patient or the care team will appear here."
                />
              )}
            </Panel>
          </>
        )
      )}
    </div>
  );
}
