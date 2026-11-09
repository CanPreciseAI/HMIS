import { useEffect, useState } from "react";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import {
  CalendarDays,
  CreditCard,
  FileText,
  HeartPulse,
  LogOut,
  Pill,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  loadPatientPortalData,
  type PatientPortalData,
} from "@/features/patient-portal/data";
import { ErrorBlock, LoadingBlock } from "@/features/dashboard/doctor";
import {
  EmptyState,
  Panel,
  StatCard,
  StatusPill,
} from "@/features/dashboard/ui";

export const Route = createFileRoute("/patient")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      throw redirect({ to: "/patient-auth" });
    }

    const { data: patient, error: patientError } = await supabase
      .from("patient_profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (patientError) throw patientError;
    if (patient) {
      return { fullName: patient.full_name, email: user.email ?? "" };
    }

    const { data: staff, error: staffError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (staff) throw redirect({ to: "/dashboard" });

    throw redirect({ to: "/patient-auth" });
  },
  component: PatientPortal,
});

function PatientPortal() {
  const { fullName, email } = Route.useRouteContext();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PatientPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user)
          throw new Error("Your session expired. Please sign in again.");
        const result = await loadPatientPortalData(user.id);
        if (!cancelled) setData(result);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your patient record.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await navigate({ to: "/patient-auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary">
              <HeartPulse className="size-4.5 text-primary-foreground" />
            </span>
            <span className="font-display font-semibold text-foreground">
              CanPreciseAI{" "}
              <span className="font-normal text-muted-foreground">
                Patient portal
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <UserRound className="size-6" />
          </span>
          <p className="mt-7 text-sm font-medium text-primary">
            Patient portal
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Welcome, {data?.patientName ?? fullName}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Your account is {email ? `connected to ${email}` : "active"}. View
            your linked care records and upcoming appointments here.
          </p>
          {data?.patients.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {data.patients.map((patient) => (
                <span
                  key={patient.id}
                  className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground"
                >
                  {patient.name} · {patient.number}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <div className="mt-6">
          {loading && <LoadingBlock />}
          {error && <ErrorBlock message={error} />}
          {data?.accessPending && (
            <Panel
              title="Your registration is waiting for reception approval"
              subtitle="Your account is secure. Reception must approve your registration and link your patient record before your dashboard opens."
            >
              <EmptyState
                icon={HeartPulse}
                title="Waiting for reception approval"
                description="Please visit the reception desk with your ID. Your dashboard will appear here as soon as they approve your account."
              />
            </Panel>
          )}
          {data && !data.accessPending && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={CalendarDays}
                  label="Upcoming appointments"
                  value={
                    data.appointments.filter(
                      (row) =>
                        row.scheduledAt >= new Date().toISOString() &&
                        ["scheduled", "checked_in"].includes(row.status),
                    ).length
                  }
                  hint="Scheduled or checked in"
                />
                <StatCard
                  icon={FileText}
                  label="Recent visits"
                  value={data.visits.length}
                  hint="Visits and admissions"
                  tone="blue"
                />
                <StatCard
                  icon={Pill}
                  label="Active medicines"
                  value={data.prescriptions.length}
                  hint="Current prescriptions"
                  tone="violet"
                />
                <StatCard
                  icon={CreditCard}
                  label="Open invoices"
                  value={
                    data.invoices.filter((row) => row.status !== "paid").length
                  }
                  hint="Issued or partly paid"
                  tone="amber"
                />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Panel
                  title="Appointments"
                  subtitle="Your latest scheduled visits"
                >
                  {data.appointments.length ? (
                    <ul className="divide-y divide-border">
                      {data.appointments.map((row) => (
                        <li
                          key={row.id}
                          className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {new Date(row.scheduledAt).toLocaleString()}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.doctor}
                              {row.department ? ` · ${row.department}` : ""}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.reason ?? "Consultation"}
                              {row.location ? ` · ${row.location}` : ""}
                            </p>
                          </div>
                          <StatusPill status={row.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={CalendarDays}
                      title="No appointments yet"
                      description="Appointments linked to your verified patient record will appear here."
                    />
                  )}
                </Panel>

                <Panel
                  title="Visits and admissions"
                  subtitle="Your recent care history"
                >
                  {data.visits.length ? (
                    <ul className="divide-y divide-border">
                      {data.visits.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div>
                            <p className="text-sm font-medium capitalize text-foreground">
                              {row.type.replace(/[_-]+/g, " ")}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(row.startedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <StatusPill status={row.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title="No visits on file"
                      description="Your visits and admissions will appear here."
                    />
                  )}
                </Panel>

                <Panel
                  title="Health information"
                  subtitle="Recorded allergies and recent observations"
                >
                  {data.allergies.length === 0 &&
                  data.observations.length === 0 ? (
                    <EmptyState
                      icon={ShieldAlert}
                      title="No health information recorded"
                      description="Allergies and observations recorded by your care team will be listed here."
                    />
                  ) : (
                    <div className="divide-y divide-border">
                      {data.allergies.map((row) => (
                        <div key={row.id} className="py-3 first:pt-0">
                          <p className="text-sm font-semibold text-foreground">
                            {row.substance} allergy
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.reaction} · {row.severity}
                          </p>
                        </div>
                      ))}
                      {data.observations.slice(0, 5).map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium capitalize text-foreground">
                              {row.name.replace(/[_-]+/g, " ")}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(row.observedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {row.value} {row.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel
                  title="Diagnoses and test results"
                  subtitle="Released information from your care team"
                >
                  {data.diagnoses.length === 0 &&
                  data.labResults.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title="No results available"
                      description="Diagnoses and verified lab results will appear here when released."
                    />
                  ) : (
                    <div className="divide-y divide-border">
                      {data.diagnoses.map((row) => (
                        <div key={row.id} className="py-3 first:pt-0">
                          <p className="text-sm font-semibold text-foreground">
                            {row.description ?? row.code}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.code} · {row.type}
                          </p>
                        </div>
                      ))}
                      {data.labResults.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {row.test}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Reference range: {row.referenceRange}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {row.value} {row.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel
                  title="Prescriptions"
                  subtitle="Active medicines and instructions"
                >
                  {data.prescriptions.length ? (
                    <ul className="divide-y divide-border">
                      {data.prescriptions.map((row) => (
                        <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                          <p className="text-sm font-semibold text-foreground">
                            {row.medicine} {row.strength}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.dose} · {row.route} · {row.frequency} ·{" "}
                            {row.duration}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={Pill}
                      title="No active prescriptions"
                      description="Current prescriptions from your visits will appear here."
                    />
                  )}
                </Panel>

                <Panel
                  title="Invoices"
                  subtitle="View your invoices and payment status. Online payment will be available once payment processing is connected."
                >
                  {data.invoices.length === 0 ? (
                    <EmptyState
                      icon={CreditCard}
                      title="No invoices yet"
                      description="Invoices issued for your linked patient record will appear here."
                    />
                  ) : (
                    <div className="divide-y divide-border">
                      {data.invoices.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              Invoice {row.number}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.issuedAt
                                ? new Date(row.issuedAt).toLocaleDateString()
                                : "Issued date unavailable"}{" "}
                              · {row.status}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-sm font-semibold text-foreground">
                              {new Intl.NumberFormat(undefined, {
                                style: "currency",
                                currency: "INR",
                                maximumFractionDigits: 0,
                              }).format(row.amount)}
                            </span>
                            <StatusPill status={row.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel
                  title="Payments"
                  subtitle="Payments recorded by your hospital"
                >
                  {data.payments.length === 0 ? (
                    <EmptyState
                      icon={CreditCard}
                      title="No payments yet"
                      description="Payments associated with your patient record will appear here."
                    />
                  ) : (
                    <div className="divide-y divide-border">
                      {data.payments.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 py-3 last:pb-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              Payment {row.reference}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.receivedAt
                                ? new Date(row.receivedAt).toLocaleDateString()
                                : "Date unavailable"}{" "}
                              · {row.status}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {new Intl.NumberFormat(undefined, {
                              style: "currency",
                              currency: row.currency || "INR",
                              maximumFractionDigits: 0,
                            }).format(row.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
