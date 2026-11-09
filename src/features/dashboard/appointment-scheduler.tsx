import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  CalendarPlus,
  Loader2,
  Stethoscope,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatTime,
  loadAppointmentPatients,
  loadDoctorDayLoad,
  loadFacilityDaySchedule,
  scheduleAppointment,
  type AppointmentPatient,
  type DoctorDayLoad,
  type FacilityAppointment,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";
import {
  AppointmentCalendar,
  type CalendarDoctorAvailability,
  type CalendarEntry,
  type CalendarEntryTone,
} from "./appointment-calendar";
import { calendarDateKey, calendarMonthDates } from "./calendar-utils";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const SLOT_MINUTES = 20;
const DAY_CAPACITY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180];

function toDateInput(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, from: start.toISOString(), to: end.toISOString() };
}

function doctorUnavailable(doctor: DoctorDayLoad) {
  return (
    doctor.availability === "on_leave" || doctor.availability === "off_duty"
  );
}

function loadStatus(doctor: DoctorDayLoad) {
  if (doctor.appointments === 0) return { label: "Free", status: "available" };
  const ratio = doctor.bookedMinutes / DAY_CAPACITY_MINUTES;
  if (ratio < 0.3) return { label: "Light", status: "scheduled" };
  if (ratio < 0.7) return { label: "Busy", status: "busy" };
  return { label: "Full", status: "urgent" };
}

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function appointmentTone(row: FacilityAppointment): CalendarEntryTone {
  if (row.status === "cancelled" || row.response === "unavailable") {
    return "unavailable";
  }
  if (row.status === "completed") return "completed";
  if (row.appointmentType === "surgery") return "surgery";
  if (row.appointmentType === "procedure") return "procedure";
  return "booked";
}

function appointmentEntry(row: FacilityAppointment): CalendarEntry {
  return {
    id: row.id,
    at: row.scheduledAt,
    title: row.patient,
    detail: `${row.doctor} · ${row.appointmentType}`,
    tone: appointmentTone(row),
  };
}

function buildDoctorAvailabilityByDay(
  doctors: DoctorDayLoad[],
  appointments: FacilityAppointment[],
  month: string,
) {
  const booked = new Map<string, { appointments: number; minutes: number }>();
  for (const appointment of appointments) {
    if (
      !["scheduled", "checked_in", "completed"].includes(appointment.status)
    ) {
      continue;
    }
    const date = calendarDateKey(appointment.scheduledAt);
    const key = `${date}|${appointment.providerId}`;
    const current = booked.get(key) ?? { appointments: 0, minutes: 0 };
    booked.set(key, {
      appointments: current.appointments + 1,
      minutes: current.minutes + appointment.durationMinutes,
    });
  }

  const availability: Record<string, CalendarDoctorAvailability[]> = {};
  for (const date of calendarMonthDates(month)) {
    availability[date] = doctors.map((doctor) => {
      const load = booked.get(`${date}|${doctor.providerId}`) ?? {
        appointments: 0,
        minutes: 0,
      };
      const freeMinutes = Math.max(DAY_CAPACITY_MINUTES - load.minutes, 0);
      return {
        id: doctor.providerId,
        name: doctor.name,
        appointments: load.appointments,
        bookedMinutes: load.minutes,
        freeMinutes,
        status:
          freeMinutes === 0 ? "full" : freeMinutes < 180 ? "busy" : "free",
      };
    });
  }
  return availability;
}

/**
 * Reception books a patient with a doctor. The doctor load chart shows how much
 * of each doctor's day is already committed, and the slot picker only offers
 * times that doctor still has free.
 */
export function AppointmentScheduler({ ctx }: { ctx: StaffContext }) {
  const [day, setDay] = useState(() => toDateInput(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() =>
    toDateInput(new Date()).slice(0, 7),
  );
  const [calendarAppointments, setCalendarAppointments] = useState<
    FacilityAppointment[]
  >([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState("");
  const [doctors, setDoctors] = useState<DoctorDayLoad[]>([]);
  const [appointments, setAppointments] = useState<FacilityAppointment[]>([]);
  const [patients, setPatients] = useState<AppointmentPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [slot, setSlot] = useState("");
  const [duration, setDuration] = useState(20);
  const [appointmentType, setAppointmentType] = useState("consultation");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");

  const refresh = useCallback(async () => {
    if (!ctx.facilityId) {
      setDoctors([]);
      setAppointments([]);
      setPatients([]);
      setLoading(false);
      return;
    }
    const range = dayRange(day);
    setLoading(true);
    setError("");
    try {
      const [loadRows, dayRows, patientRows] = await Promise.all([
        loadDoctorDayLoad(ctx, range.from, range.to),
        loadFacilityDaySchedule(ctx, range.from, range.to),
        loadAppointmentPatients(ctx),
      ]);
      setDoctors(loadRows);
      setAppointments(dayRows);
      setPatients(patientRows);
      setProviderId((current) =>
        loadRows.some((row) => row.providerId === current) ? current : "",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the appointment schedule.",
      );
    } finally {
      setLoading(false);
    }
  }, [ctx, day]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setCalendarMonth(day.slice(0, 7));
  }, [day]);

  const refreshCalendar = useCallback(async () => {
    if (!ctx.facilityId) {
      setCalendarAppointments([]);
      setCalendarLoading(false);
      return;
    }
    const range = monthRange(calendarMonth);
    setCalendarLoading(true);
    setCalendarError("");
    try {
      setCalendarAppointments(
        await loadFacilityDaySchedule(ctx, range.from, range.to),
      );
    } catch (cause) {
      setCalendarAppointments([]);
      setCalendarError(
        cause instanceof Error
          ? cause.message
          : "Could not load the appointment calendar.",
      );
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarMonth, ctx]);

  useEffect(() => {
    void refreshCalendar();
  }, [refreshCalendar]);

  const calendarEntries = useMemo(
    () => calendarAppointments.map(appointmentEntry),
    [calendarAppointments],
  );
  const calendarDoctorAvailability = useMemo(
    () =>
      buildDoctorAvailabilityByDay(
        doctors,
        calendarAppointments,
        calendarMonth,
      ),
    [calendarAppointments, calendarMonth, doctors],
  );

  const selectedDoctor =
    doctors.find((doctor) => doctor.providerId === providerId) ?? null;
  const selectedDoctorUnavailable = selectedDoctor
    ? doctorUnavailable(selectedDoctor)
    : false;

  const visiblePatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = term
      ? patients.filter(
          (patient) =>
            patient.name.toLowerCase().includes(term) ||
            patient.number.toLowerCase().includes(term),
        )
      : patients;
    rows = rows.slice(0, 80);
    const selected = patients.find((patient) => patient.id === patientId);
    if (selected && !rows.some((patient) => patient.id === selected.id)) {
      rows = [selected, ...rows];
    }
    return rows;
  }, [patients, patientId, search]);

  const slots = useMemo(() => {
    if (!providerId || selectedDoctorUnavailable) return [];
    const range = dayRange(day);
    const booked = appointments.filter(
      (row) =>
        row.providerId === providerId &&
        ["scheduled", "checked_in", "completed"].includes(row.status),
    );
    const now = Date.now();
    const rows: { iso: string; label: string; busy: boolean }[] = [];
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
      for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
        const at = new Date(range.start);
        at.setHours(hour, minute, 0, 0);
        const ends = new Date(at.getTime() + duration * 60_000);
        if (ends.getTime() < now) continue;
        const busy = booked.some((row) => {
          const rowStart = new Date(row.scheduledAt).getTime();
          const rowEnd = rowStart + row.durationMinutes * 60_000;
          return rowStart < ends.getTime() && rowEnd > at.getTime();
        });
        rows.push({
          iso: at.toISOString(),
          label: formatTime(at.toISOString()),
          busy,
        });
      }
    }
    return rows;
  }, [appointments, day, duration, providerId, selectedDoctorUnavailable]);

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId || !providerId || !slot) {
      setFormError("Choose the patient, the doctor and a free time slot.");
      return;
    }
    if (selectedDoctorUnavailable) {
      setFormError(
        "That doctor is on leave or off duty. Choose another doctor.",
      );
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await scheduleAppointment(ctx, {
        patientId,
        providerId,
        scheduledAt: slot,
        durationMinutes: duration,
        appointmentType,
        reason,
        location,
      });
      toast.success(
        `${patients.find((patient) => patient.id === patientId)?.name ?? "Patient"} booked with ${selectedDoctor?.name ?? "the doctor"} — the doctor has been notified`,
      );
      setPatientId("");
      setReason("");
      setLocation("");
      setSlot("");
      const range = dayRange(day);
      const [loadRows, dayRows] = await Promise.all([
        loadDoctorDayLoad(ctx, range.from, range.to),
        loadFacilityDaySchedule(ctx, range.from, range.to),
      ]);
      setDoctors(loadRows);
      setAppointments(dayRows);
      void refreshCalendar();
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Could not schedule the appointment.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Appointment calendar"
        subtitle="See every appointment and each doctor's free or busy status across the month. Select a day to review its doctor load and free slots."
      >
        {calendarError && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {calendarError}
          </p>
        )}
        {calendarLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading the appointment calendar…
          </p>
        ) : (
          <AppointmentCalendar
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            selectedDate={day}
            onSelectDate={(date) => {
              setDay(date);
              setSlot("");
            }}
            entries={calendarEntries}
            doctorAvailability={calendarDoctorAvailability}
          />
        )}
      </Panel>

      <Panel
        title="Doctor load for the day"
        subtitle="Minutes already booked against an eight-hour clinic day. Pick a doctor to see their free slots."
        action={
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Day
              <input
                type="date"
                value={day}
                onChange={(event) => {
                  setDay(event.currentTarget.value);
                  setSlot("");
                }}
                className="ml-2 h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </label>
          </div>
        }
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading the doctor load chart…
          </p>
        ) : doctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No doctors in this facility"
            description="Doctors appear here once they are registered in a department of your facility."
          />
        ) : (
          <div className="space-y-2">
            {doctors.map((doctor) => {
              const percent = Math.min(
                Math.round((doctor.bookedMinutes / DAY_CAPACITY_MINUTES) * 100),
                100,
              );
              const status = loadStatus(doctor);
              const unavailable = doctorUnavailable(doctor);
              const selected = doctor.providerId === providerId;
              return (
                <button
                  key={doctor.providerId}
                  type="button"
                  onClick={() => {
                    setProviderId(doctor.providerId);
                    setSlot("");
                  }}
                  disabled={unavailable}
                  aria-pressed={selected}
                  className={`w-full rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? "border-primary bg-secondary/60"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {doctor.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {doctor.department ?? "No department"}
                        {doctor.designation ? ` · ${doctor.designation}` : ""}
                        {doctor.firstSlot
                          ? ` · first ${formatTime(doctor.firstSlot)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {doctor.appointments} booked · {doctor.bookedMinutes}{" "}
                        min
                      </span>
                      <StatusPill
                        status={
                          unavailable ? doctor.availability : status.status
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        percent >= 70
                          ? "bg-rose-500"
                          : percent >= 30
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{
                        width: `${doctor.bookedMinutes > 0 ? Math.max(percent, 3) : 0}%`,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Book an appointment"
        subtitle={
          selectedDoctor
            ? `${selectedDoctor.name} · ${selectedDoctor.department ?? "No department"}`
            : "Choose a doctor from the load chart above."
        }
      >
        <form onSubmit={(event) => void book(event)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0">
              <label className="text-xs font-medium text-muted-foreground">
                Find patient
                <input
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Search by name or MRN"
                  disabled={saving}
                  className={fieldClass}
                />
              </label>
              <label className="mt-2 block text-xs font-medium text-muted-foreground">
                Patient
                <select
                  value={patientId}
                  onChange={(event) => setPatientId(event.currentTarget.value)}
                  disabled={saving}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a patient</option>
                  {visiblePatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} · {patient.number}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="min-w-0">
              <label className="text-xs font-medium text-muted-foreground">
                Doctor
                <select
                  value={providerId}
                  onChange={(event) => {
                    setProviderId(event.currentTarget.value);
                    setSlot("");
                  }}
                  disabled={saving}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a doctor</option>
                  {doctors.map((doctor) => (
                    <option
                      key={doctor.providerId}
                      value={doctor.providerId}
                      disabled={doctorUnavailable(doctor)}
                    >
                      {doctor.name} · {doctor.appointments} booked
                      {doctorUnavailable(doctor) ? " · unavailable" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="min-w-0">
              <label className="text-xs font-medium text-muted-foreground">
                Visit type
                <select
                  value={appointmentType}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setAppointmentType(next);
                    setDuration(
                      next === "surgery" ? 60 : next === "procedure" ? 45 : 20,
                    );
                    setSlot("");
                  }}
                  disabled={saving}
                  className={fieldClass}
                >
                  <option value="consultation">Consultation</option>
                  <option value="surgery">Surgery</option>
                  <option value="procedure">Procedure</option>
                </select>
              </label>
              <label className="mt-2 block text-xs font-medium text-muted-foreground">
                Visit length
                <select
                  value={duration}
                  onChange={(event) => {
                    setDuration(Number(event.currentTarget.value));
                    setSlot("");
                  }}
                  disabled={saving}
                  className={fieldClass}
                >
                  {DURATION_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Time slot
            </p>
            {!providerId ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Select a doctor to see their free slots.
              </p>
            ) : selectedDoctorUnavailable ? (
              <p className="mt-2 text-xs text-destructive">
                This doctor is on leave or off duty. Choose another doctor.
              </p>
            ) : slots.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No slots remain in this doctor&apos;s day. Choose another doctor
                or day.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {slots.map((item) => (
                  <button
                    key={item.iso}
                    type="button"
                    disabled={item.busy || saving}
                    onClick={() => setSlot(item.iso)}
                    aria-pressed={slot === item.iso}
                    className={`h-9 rounded-lg border text-xs font-semibold transition ${
                      slot === item.iso
                        ? "border-primary bg-primary text-primary-foreground"
                        : item.busy
                          ? "cursor-not-allowed border-border bg-muted text-muted-foreground line-through"
                          : "border-input text-foreground hover:bg-accent"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
              {appointmentType === "surgery"
                ? "Procedure / surgery"
                : "Reason for visit"}
              <input
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder={
                  appointmentType === "surgery"
                    ? "e.g. Appendectomy"
                    : "e.g. Follow-up consultation"
                }
                disabled={saving}
                className={fieldClass}
              />
            </label>
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
              {appointmentType === "surgery" ? "Theatre" : "Where"}
              <input
                value={location}
                onChange={(event) => setLocation(event.currentTarget.value)}
                placeholder={
                  appointmentType === "surgery"
                    ? "e.g. Theatre 1"
                    : "e.g. Consultation room 2"
                }
                disabled={saving}
                className={fieldClass}
              />
            </label>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !patientId || !providerId || !slot}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarPlus className="size-4" />
            )}
            {saving ? "Booking…" : "Book appointment"}
          </button>
        </form>
      </Panel>

      <Panel
        title="Appointments on this day"
        subtitle={`${appointments.length} appointment${appointments.length === 1 ? "" : "s"} in this facility`}
      >
        {appointments.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointments booked"
            description="Appointments reception books for this day will appear here with the doctor and place."
          />
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[840px] border-collapse text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-1 py-2 font-semibold">Time</th>
                  <th className="px-1 py-2 font-semibold">Type</th>
                  <th className="px-1 py-2 font-semibold">Patient</th>
                  <th className="px-1 py-2 font-semibold">Doctor</th>
                  <th className="px-1 py-2 font-semibold">Reason</th>
                  <th className="px-1 py-2 font-semibold">Where</th>
                  <th className="px-1 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-1 py-2.5 font-medium text-foreground">
                      {formatTime(row.scheduledAt)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {row.durationMinutes}m
                      </span>
                    </td>
                    <td className="px-1 py-2.5">
                      <StatusPill status={row.appointmentType} />
                    </td>
                    <td className="px-1 py-2.5">
                      <p className="text-sm font-medium text-foreground">
                        {row.patient}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.number}
                      </p>
                    </td>
                    <td className="px-1 py-2.5 text-foreground">
                      {row.doctor}
                    </td>
                    <td className="px-1 py-2.5 text-muted-foreground">
                      {row.reason ?? "—"}
                    </td>
                    <td className="px-1 py-2.5 text-muted-foreground">
                      {row.location ?? "—"}
                    </td>
                    <td className="px-1 py-2.5">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Patients available to book"
        subtitle="Active patient records in your hospital"
      >
        {patients.length ? (
          <div className="flex flex-wrap gap-2">
            {patients.slice(0, 12).map((patient) => (
              <button
                key={patient.id}
                type="button"
                onClick={() => setPatientId(patient.id)}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition hover:bg-secondary/70"
              >
                {patient.name} · {patient.number}
              </button>
            ))}
            {patients.length > 12 && (
              <span className="inline-flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                <Users className="size-3.5" /> {patients.length - 12} more in
                the patient register
              </span>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No active patients"
            description="Register the patient first, then book their appointment here."
          />
        )}
      </Panel>
    </div>
  );
}
