import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  FileText,
  FlaskConical,
  Loader2,
  Send,
  TestTubes,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  loadLabTechnicianData,
  type LabTechnicianData,
  type StaffContext,
} from "./data";
import {
  loadLabResultsForReview,
  recordLabResult,
  updateLabItemStatus,
  verifyLabResult,
  type LabReviewResult,
} from "./lab-workflow-data";
import { EmptyState, Panel, StatusPill } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const LAB_STATUSES = [
  { value: "ordered", label: "Ordered" },
  { value: "collected", label: "Sample collected" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Laboratory sample queue with the technician's working actions: move a
 * sample through its statuses, record the result, and send the report back to
 * the doctor who ordered it for verification.
 */
export function SampleQueuePanel({ ctx }: { ctx: StaffContext }) {
  const [data, setData] = useState<LabTechnicianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadLabTechnicianData(ctx));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the laboratory sample queue.",
      );
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-5">
      <Panel
        title="Samples awaiting processing"
        subtitle="Update a sample's status, or record the result and send it back to the ordering doctor."
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading && !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading the sample queue…
          </p>
        ) : data && data.queue.length ? (
          <ul className="divide-y divide-border">
            {data.queue.map((row) => (
              <SampleQueueRow
                key={row.id}
                row={row}
                onChanged={() => void refresh()}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={TestTubes}
            title="No samples waiting"
            description="Tests a doctor assigns to you will appear here with their accession numbers."
          />
        )}
      </Panel>
    </div>
  );
}

function SampleQueueRow({
  row,
  onChanged,
}: {
  row: LabTechnicianData["queue"][number];
  onChanged: () => void;
}) {
  const [savingStatus, setSavingStatus] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [sending, setSending] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [reference, setReference] = useState("");
  const [critical, setCritical] = useState(false);

  async function changeStatus(next: string) {
    setSavingStatus(true);
    try {
      await updateLabItemStatus({ itemId: row.id, status: next });
      toast.success("Test status updated");
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not update the test status.",
      );
    } finally {
      setSavingStatus(false);
    }
  }

  async function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) {
      toast.error("Enter the result value.");
      return;
    }
    setSending(true);
    try {
      await recordLabResult({
        itemId: row.id,
        value,
        unit,
        referenceRange: reference,
        critical,
      });
      setValue("");
      setUnit("");
      setReference("");
      setCritical(false);
      setShowResult(false);
      toast.success("Result sent to the ordering doctor for verification");
      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not send the result.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {row.test} · {row.patient}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.accession} · ordered {formatDate(row.orderedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            status={row.priority === "stat" ? "urgent" : row.priority}
          />
          <StatusPill status={row.status} />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Status
            <select
              value={row.status}
              disabled={savingStatus}
              onChange={(event) => void changeStatus(event.currentTarget.value)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              {row.status === "collected" ? null : (
                <option value="ordered">Ordered</option>
              )}
              <option value="collected">Sample collected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowResult((current) => !current)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <FlaskConical className="size-3.5" />
            {showResult ? "Close result" : "Record result"}
          </button>
        </div>
      </div>

      {showResult && (
        <form
          onSubmit={(event) => void submitResult(event)}
          className="mt-3 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2"
        >
          <label className="text-xs font-medium text-foreground">
            Result value
            <input
              required
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              placeholder="e.g. 7.2"
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Unit (optional)
            <input
              value={unit}
              onChange={(event) => setUnit(event.currentTarget.value)}
              placeholder="e.g. mmol/L"
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Reference range (optional)
            <input
              value={reference}
              onChange={(event) => setReference(event.currentTarget.value)}
              placeholder="e.g. 3.9 – 5.5"
              className={fieldClass}
            />
          </label>
          <label className="flex items-center gap-2 self-end text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={critical}
              onChange={(event) => setCritical(event.currentTarget.checked)}
              className="size-4 rounded border-input text-primary focus:ring-ring"
            />
            Flag as critical
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={sending || !value.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              <Send className="size-4" />
              {sending ? "Sending…" : "Send result to doctor"}
            </button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              The doctor who ordered this test sees it under “Results to
              verify”.
            </p>
          </div>
        </form>
      )}
    </li>
  );
}

/** Results the laboratory sent back, for the ordering doctor to verify. */
export function LabResultsReviewPanel({ ctx }: { ctx: StaffContext }) {
  const [results, setResults] = useState<LabReviewResult[] | null>(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      setResults(await loadLabResultsForReview(ctx));
    } catch (cause) {
      setResults([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the results waiting for verification.",
      );
    }
  }, [ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function verify(resultId: string) {
    setVerifying(resultId);
    try {
      await verifyLabResult(resultId);
      toast.success("Result verified");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not verify the result.",
      );
    } finally {
      setVerifying(null);
    }
  }

  return (
    <Panel
      title="Results to verify"
      subtitle="Laboratory reports your technician sent back for the tests you ordered."
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {results === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading results…
        </p>
      ) : results.length ? (
        <ul className="divide-y divide-border">
          {results.map((row) => (
            <li
              key={row.resultId}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.test} · {row.patient}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.referenceRange
                    ? `Reference ${row.referenceRange} · `
                    : ""}
                  {formatDate(row.at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {row.value}
                  {row.unit ? ` ${row.unit}` : ""}
                </span>
                {row.critical && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                    Critical
                  </span>
                )}
                <StatusPill status="preliminary" />
                <button
                  type="button"
                  onClick={() => void verify(row.resultId)}
                  disabled={verifying === row.resultId}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <CheckCircle2 className="size-3.5" />
                  {verifying === row.resultId ? "Verifying…" : "Verify"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FileText}
          title="No results waiting"
          description="Reports the laboratory sends back for your tests will be listed here."
        />
      )}
    </Panel>
  );
}
