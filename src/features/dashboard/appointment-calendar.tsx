import { useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTime } from "./data";
import { calendarDateKey } from "./calendar-utils";

export type CalendarEntryTone =
  | "booked"
  | "pending"
  | "confirmed"
  | "unavailable"
  | "surgery"
  | "procedure"
  | "completed";

export type CalendarEntry = {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: CalendarEntryTone;
};

export type CalendarDoctorAvailability = {
  id: string;
  name: string;
  appointments: number;
  bookedMinutes: number;
  freeMinutes: number;
  status: "free" | "busy" | "full";
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TONE_CLASS: Record<CalendarEntryTone, string> = {
  booked: "bg-secondary text-secondary-foreground",
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  unavailable: "bg-rose-100 text-rose-800",
  surgery: "bg-violet-100 text-violet-800",
  procedure: "bg-sky-100 text-sky-800",
  completed: "bg-muted text-muted-foreground",
};

const LEGEND: { tone: CalendarEntryTone; label: string }[] = [
  { tone: "booked", label: "Booked" },
  { tone: "pending", label: "Awaiting reply" },
  { tone: "confirmed", label: "Available" },
  { tone: "unavailable", label: "Unavailable" },
  { tone: "surgery", label: "Surgery / procedure" },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(month: string, delta: number) {
  const [yearPart = "", monthPart = ""] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  const next = new Date(year, monthNumber - 1 + delta, 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
}

function monthDays(month: string) {
  const [yearPart = "", monthPart = ""] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  const first = new Date(year, monthNumber - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > total) return null;
    return `${month}-${pad(day)}`;
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * A compact month calendar shared by reception and doctors. Entries remain
 * inline, and selecting a day lets the surrounding screen show that day's
 * availability, appointments and free slots.
 */
export function AppointmentCalendar({
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  entries,
  doctorAvailability = {},
}: {
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  entries: CalendarEntry[];
  doctorAvailability?: Record<string, CalendarDoctorAvailability[]>;
}) {
  const today = calendarDateKey(new Date());
  const hasDoctorAvailability = Object.values(doctorAvailability).some(
    (dayDoctors) => dayDoctors.length > 0,
  );
  const byDay = useMemo(() => {
    const groups = new Map<string, CalendarEntry[]>();
    for (const entry of [...entries].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    )) {
      const date = calendarDateKey(entry.at);
      groups.set(date, [...(groups.get(date) ?? []), entry]);
    }
    return groups;
  }, [entries]);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="grid size-8 place-items-center rounded-lg border border-input text-foreground transition hover:bg-accent"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="min-w-36 text-center font-display text-sm font-semibold text-foreground">
            {monthLabel(month)}
          </p>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            aria-label="Next month"
            className="grid size-8 place-items-center rounded-lg border border-input text-foreground transition hover:bg-accent"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onMonthChange(today.slice(0, 7));
              onSelectDate(today);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            <CalendarDays className="size-3.5" /> Today
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {entries.length} appointment{entries.length === 1 ? "" : "s"} this
          month
        </p>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((weekday) => (
              <p
                key={weekday}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {weekday}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays(month).map((date, index) => {
              if (!date) {
                return (
                  <div
                    key={`blank-${index}`}
                    className="min-h-24 rounded-lg bg-muted/20"
                  />
                );
              }
              const dayEntries = byDay.get(date) ?? [];
              const dayDoctors = doctorAvailability[date] ?? [];
              const selected = date === selectedDate;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onSelectDate(date)}
                  aria-pressed={selected}
                  aria-label={`${date}, ${dayEntries.length} appointment${dayEntries.length === 1 ? "" : "s"}`}
                  className={`min-h-24 rounded-lg border p-1.5 text-left align-top transition ${
                    selected
                      ? "border-primary bg-secondary/50 ring-1 ring-primary"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                        date === today
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {Number(date.slice(-2))}
                    </span>
                    {dayEntries.length > 0 && (
                      <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border ring-inset">
                        {dayEntries.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayEntries.slice(0, 2).map((entry) => (
                      <span
                        key={entry.id}
                        title={`${formatTime(entry.at)} · ${entry.title} · ${entry.detail}`}
                        className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium ${TONE_CLASS[entry.tone]}`}
                      >
                        {formatTime(entry.at)} {entry.title}
                      </span>
                    ))}
                    {dayEntries.length > 2 && (
                      <span className="block px-1 text-[10px] text-muted-foreground">
                        +{dayEntries.length - 2} more
                      </span>
                    )}
                  </div>
                  {dayDoctors.length > 0 && (
                    <div
                      className="mt-1 flex flex-wrap items-center gap-0.5 border-t border-border/60 pt-1"
                      title="Doctor availability"
                    >
                      {dayDoctors.slice(0, 4).map((doctor) => {
                        const label =
                          doctor.status === "full"
                            ? "fully booked"
                            : `${doctor.freeMinutes} min free`;
                        return (
                          <span
                            key={doctor.id}
                            title={`${doctor.name}: ${label} · ${doctor.appointments} appointment${doctor.appointments === 1 ? "" : "s"}`}
                            className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[8px] font-bold ${
                              doctor.status === "free"
                                ? "bg-emerald-100 text-emerald-700"
                                : doctor.status === "busy"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {initials(doctor.name)}
                          </span>
                        );
                      })}
                      {dayDoctors.length > 4 && (
                        <span
                          title={dayDoctors
                            .slice(4)
                            .map(
                              (doctor) =>
                                `${doctor.name}: ${
                                  doctor.status === "full"
                                    ? "fully booked"
                                    : `${doctor.freeMinutes} min free`
                                }`,
                            )
                            .join("\n")}
                          className="text-[9px] text-muted-foreground"
                        >
                          +{dayDoctors.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {LEGEND.map(({ tone, label }) => (
          <span key={tone} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${TONE_CLASS[tone]}`} />
            {label}
          </span>
        ))}
        {hasDoctorAvailability && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-100" />
              Doctor free
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-100" />
              Partly busy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-100" />
              Fully booked
            </span>
          </>
        )}
      </div>
    </div>
  );
}
