import { useState } from "react";
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { CheckCircle2, Clock3, HeartPulse, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/staff-pending")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw redirect({ to: "/auth" });

    const { data: role, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .limit(1);
    if (roleError) throw roleError;
    const { data: employment, error: employmentError } =
      await supabase.rpc("my_employment");
    if (employmentError) throw employmentError;
    if (
      role?.length ||
      employment?.some((row) => row.role_names?.includes("hospital_admin"))
    ) {
      throw redirect({ to: "/dashboard" });
    }

    const { data: request, error: requestError } = await supabase
      .from("staff_approval_requests")
      .select("full_name, requested_role, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (requestError) throw requestError;
    const { data: hospitalRequest, error: hospitalRequestError } =
      await supabase
        .from("hospital_admin_registration_requests")
        .select("full_name, hospital_name, status")
        .eq("user_id", user.id)
        .maybeSingle();
    if (hospitalRequestError) throw hospitalRequestError;
    if (!request && !hospitalRequest) throw redirect({ to: "/auth" });
    return {
      fullName: request?.full_name ?? hospitalRequest?.full_name ?? "Applicant",
      role: request?.requested_role ?? "",
      status: request?.status ?? hospitalRequest?.status ?? "pending",
      applicantType: request ? "staff" : "hospital_admin",
      hospitalName: hospitalRequest?.hospital_name ?? null,
    };
  },
  component: StaffPendingPage,
});

const roleLabels: Record<string, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  lab_technician: "Lab Technician",
  pharmacist: "Pharmacist",
  receptionist: "Receptionist",
};

function StaffPendingPage() {
  const { fullName, role, status, applicantType, hospitalName } =
    Route.useRouteContext();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await router.navigate({ to: "/auth" });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 text-center shadow-sm sm:p-10">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
          {status === "pending" ? (
            <Clock3 className="size-7" />
          ) : (
            <CheckCircle2 className="size-7" />
          )}
        </div>
        <p className="mt-6 text-sm font-medium text-primary">
          {applicantType === "staff"
            ? "Staff access"
            : "Hospital administrator"}
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-foreground">
          {status === "pending"
            ? "Your request is under review"
            : "Your request has been reviewed"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {status === "pending"
            ? applicantType === "staff"
              ? `Thanks, ${fullName}. Your ${roleLabels[role] ?? "staff"} access request for ${hospitalName ?? "your hospital"} has been sent to its hospital administrator. You’ll be able to sign in once it’s approved.`
              : `Thanks, ${fullName}. Your application to create ${hospitalName ?? "your hospital"} has been sent to the CanPreciseAI administrator.`
            : applicantType === "staff"
              ? "Your staff access request was not approved. Please contact your hospital administrator if you believe this is a mistake."
              : "Your hospital administrator application was not approved. Please contact CanPreciseAI if you believe this is a mistake."}
        </p>
        {status === "pending" && (
          <button
            type="button"
            onClick={() => router.invalidate()}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Check request status
          </button>
        )}
        <div className="mt-7 flex items-center justify-center gap-4">
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Go home
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <HeartPulse className="size-4 text-primary" /> CanPreciseAI
        </div>
      </section>
    </main>
  );
}
