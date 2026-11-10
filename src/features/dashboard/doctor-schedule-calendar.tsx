import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import {
  formatTime,
  loadDoctorScheduleMonth,
  type DoctorScheduleEntry,
  type StaffContext,
} from "./data";
import {
  AppointmentCalendar,
  type CalendarEntry,
  type CalendarEntryTone,
} from "./appointment-calendar";
import { calendarDateKey, calendarMonthKey } from "./calendar-utils";
import { EmptyState, StatusPill } from "./ui";

function scheduleTone(row: DoctorScheduleEntry): CalendarEntryTone {
  if (row.status === "cancelled" || row.response === "unavailable") {
    return "unavailable";
  }
  if (row.status === "completed") return "completed";
  if (row.response === "pending") return "pending";
  if (row.appointmentType === "surgery") return "surgery";
  if (row.appointmentType === "procedure") return "procedure";
  return "confirmed";
}

function dayLabel(date: string) {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Month view of the doctor's own clinic, with the selected day's visits below
 * it. Appointment entries carry their status colour so busy days are visible
 * at a glance.
 */
export function DoctorScheduleCalendar({ ctx }: { ctx: StaffContext }) {
  const today = calendarDateKey(new Date());
  const [month, setMonth] = useState(() => calendarMonthKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(today);
  const [rows, setRows] = useState<DoctorScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    void loadDoctorScheduleMonth(ctx, month)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load your schedule.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, month]);

  const entries = useMemo<CalendarEntry[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        at: row.at,
        title: row.patient,
        detail: `${row.appointmentType} · ${row.durationMinutes} min${row.number ? ` · ${row.number}` : ""}`,
        tone: scheduleTone(row),
      })),
    [rows],
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => calendarDateKey(row.at) === selectedDate),
    [rows, selectedDate],
  );

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid place-items-center rounded-xl border border-border bg-muted/20 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <p className="mt-2 text-xs">Loading your schedule…</p>
        </div>
      ) : (
        <>
          <AppointmentCalendar
            month={month}
            onMonthChange={(next) => {
              setMonth(next);
              setSelectedDate(
                next === today.slice(0, 7) ? today : `${next}-01`,
              );
            }}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            entries={entries}
          />

          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {dayLabel(selectedDate)}
              </p>
              <span className="text-xs text-muted-foreground">
                {selectedRows.length} appointment
                {selectedRows.length === 1 ? "" : "s"}
              </span>
            </div>

            {selectedRows.length === 0 ? (
              <div className="mt-2">
                <EmptyState
                  icon={CalendarDays}
                  title="No appointments on this day"
                  description="Choose another day in the calendar, or use the arrows to browse a different month."
                />
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {selectedRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-14 shrink-0 place-items-center rounded-lg bg-background text-xs font-semibold text-foreground">
                        {formatTime(row.at)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {row.patient}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.appointmentType} · {row.number ?? "No MRN"}
                          {row.reason ? ` · ${row.reason}` : ""}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={row.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
