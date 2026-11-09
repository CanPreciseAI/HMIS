import { useEffect, useState } from "react";
import {
  CalendarCheck,
  Check,
  Loader2,
  MapPin,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadDoctorAppointments,
  respondToAppointment,
  type DoctorAppointment,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";
import {
  AppointmentCalendar,
  type CalendarEntry,
  type CalendarEntryTone,
} from "./appointment-calendar";
import { calendarDateKey, calendarMonthKey } from "./calendar-utils";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

function patientAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function appointmentTone(row: DoctorAppointment): CalendarEntryTone {
  if (row.status === "cancelled" || row.response === "unavailable") {
    return "unavailable";
  }
  if (row.status === "completed") return "completed";
  if (row.response === "pending") return "pending";
  if (row.appointmentType === "surgery") return "surgery";
  if (row.appointmentType === "procedure") return "procedure";
  return "confirmed";
}

/**
 * Appointments the reception team scheduled for this doctor. The doctor sees the
 * patient's details before the visit and confirms whether they are available;
 * reception then sees the answer.
 */
export function DoctorAppointmentsPanel({ ctx }: { ctx: StaffContext }) {
  const [rows, setRows] = useState<DoctorAppointment[] | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    calendarMonthKey(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    calendarDateKey(new Date()),
  );

  useEffect(() => {
    let cancelled = false;
    void loadDoctorAppointments(ctx)
      .then((appointments) => {
        if (cancelled) return;
        setRows(appointments);
        setNotes(
          Object.fromEntries(
            appointments.map((row) => [row.id, row.note ?? ""]),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load your appointments.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  async function respond(
    row: DoctorAppointment,
    response: "available" | "unavailable",
  ) {
    setBusyId(row.id);
    try {
      await respondToAppointment(ctx, row.id, response, notes[row.id] ?? "");
      setRows((current) =>
        (current ?? []).map((item) =>
          item.id === row.id
            ? {
                ...item,
                response,
                note: notes[row.id]?.trim() || null,
                respondedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      toast.success(
        response === "available"
          ? "Reception will see that you are available"
          : "Reception will see that you are not available",
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not save your availability.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const calendarEntries: CalendarEntry[] = (rows ?? []).map((row) => ({
    id: row.id,
    at: row.scheduledAt,
    title: row.patient,
    detail: `${row.appointmentType} · ${row.durationMinutes} min${row.number ? ` · ${row.number}` : ""}`,
    tone: appointmentTone(row),
  }));

  return (
    <Panel
      title="Appointments from reception"
      subtitle="Each visit shows the patient's details, what it is for and where. Confirm whether you are available so reception can plan the clinic."
    >
      {rows && rows.length > 0 && (
        <div className="mb-5 rounded-xl border border-border bg-muted/20 p-3">
          <AppointmentCalendar
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            entries={calendarEntries}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">
          Loading your appointments…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No booked appointments"
          description="When reception schedules a patient with you, the appointment appears here with their details."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const age = patientAge(row.dateOfBirth);
            return (
              <li key={row.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {row.patient}
                      {row.number ? ` · ${row.number}` : ""}
                      <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
                        {row.appointmentType}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(row.scheduledAt).toLocaleString()} ·{" "}
                      {row.durationMinutes} min ·{" "}
                      {row.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  <StatusPill
                    status={
                      row.response === "pending"
                        ? "scheduled"
                        : row.response === "available"
                          ? "confirmed"
                          : "cancelled"
                    }
                  />
                </div>

                <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <UserRound className="size-3.5" /> Patient details
                  </p>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground">Sex</dt>
                      <dd className="capitalize text-foreground">
                        {row.sex ?? "Not recorded"}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground">Age</dt>
                      <dd className="text-foreground">
                        {age === null ? "Not recorded" : `${age} years`}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground">Date of birth</dt>
                      <dd className="text-foreground">
                        {row.dateOfBirth
                          ? new Date(row.dateOfBirth).toLocaleDateString()
                          : "Not recorded"}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="size-3" /> Contact
                      </dt>
                      <dd className="truncate text-foreground">
                        {row.contact ?? "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Reason:</span>{" "}
                    {row.reason ?? "Not recorded"}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {row.location ?? "Location not set"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Allergies:
                    </span>{" "}
                    {row.allergies.length
                      ? row.allergies.join(", ")
                      : "None recorded"}
                  </p>
                </div>

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {row.response === "available"
                    ? "You said you are available"
                    : row.response === "unavailable"
                      ? "You said you are not available"
                      : "Waiting for your answer"}
                  {row.note ? ` · ${row.note}` : ""}
                </p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
                    Note for reception (optional)
                    <input
                      value={notes[row.id] ?? ""}
                      onChange={(event) =>
                        setNotes({
                          ...notes,
                          [row.id]: event.currentTarget.value,
                        })
                      }
                      placeholder="e.g. running theatre until 11am"
                      disabled={busyId !== null}
                      className={fieldClass}
                    />
                  </label>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void respond(row, "available")}
                      disabled={busyId !== null || row.response === "available"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busyId === row.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      I'm available
                    </button>
                    <button
                      type="button"
                      onClick={() => void respond(row, "unavailable")}
                      disabled={
                        busyId !== null || row.response === "unavailable"
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                    >
                      <X className="size-4" /> Not available
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
