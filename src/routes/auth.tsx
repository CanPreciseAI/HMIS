import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/auth-hero.jpg";
import logo from "@/assets/canprecise-logo.png";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    mode: z.enum(["signin", "signup"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — CanPreciseAI" },
      {
        name: "description",
        content:
          "Sign in to CanPreciseAI or register a staff account for doctors, nurses, lab technicians, pharmacists and receptionists.",
      },
      { property: "og:title", content: "Sign in — CanPreciseAI" },
      {
        property: "og:description",
        content:
          "Secure access for hospital staff. Sign in or register your CanPreciseAI staff account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Role =
  | "doctor"
  | "nurse"
  | "lab_technician"
  | "pharmacist"
  | "receptionist"
  | "insurance";
const ROLES: { value: Role; label: string; blurb: string }[] = [
  {
    value: "doctor",
    label: "Doctor",
    blurb: "Consultations, diagnoses, prescriptions",
  },
  { value: "nurse", label: "Nurse", blurb: "Ward care and patient monitoring" },
  {
    value: "lab_technician",
    label: "Lab Technician",
    blurb: "Samples, tests and reports",
  },
  {
    value: "pharmacist",
    label: "Pharmacist",
    blurb: "Dispensing and inventory",
  },
  {
    value: "receptionist",
    label: "Receptionist",
    blurb: "Registration and appointments",
  },
  {
    value: "insurance",
    label: "Insurance company",
    blurb: "Policies and claims",
  },
];

const needsLicense = (role: Role) =>
  role !== "receptionist" && role !== "insurance";

const signupSchema = z
  .object({
    accountType: z.enum(["staff", "hospital_admin"]),
    role: z
      .enum([
        "doctor",
        "nurse",
        "lab_technician",
        "pharmacist",
        "receptionist",
        "insurance",
      ])
      .optional()
      .or(z.literal("")),
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name")
      .max(100, "Name is too long"),
    email: z.string().trim().email("Enter a valid email address").max(255),
    phone: z
      .string()
      .trim()
      .regex(/^[+\d][\d\s\-()]{5,19}$/, "Enter a valid phone number"),
    department: z.string().trim().max(80),
    tenantId: z.string().uuid().or(z.literal("")),
    hospitalName: z.string().trim().max(160),
    specialization: z.string().trim().max(80),
    licenseNumber: z.string().trim().max(40),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Password is too long"),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.accountType === "staff" && !data.role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["role"],
        message: "Choose your role",
      });
    }
    if (
      data.accountType === "staff" &&
      !data.tenantId &&
      data.email.toLowerCase() !== "prajvalakka021@gmail.com"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tenantId"],
        message: "Choose your hospital",
      });
    }
    if (data.accountType === "hospital_admin" && data.hospitalName.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hospitalName"],
        message: "Enter the hospital name",
      });
    }
    if (
      data.accountType === "staff" &&
      data.role === "doctor" &&
      data.specialization.trim().length < 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialization"],
        message: "Enter your specialisation",
      });
    }
    if (
      data.accountType === "staff" &&
      data.role &&
      needsLicense(data.role) &&
      data.licenseNumber.trim().length < 3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["licenseNumber"],
        message: "Enter your registration / licence number",
      });
    }
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

const signinSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(1, "Enter your password"),
});

type FormState = {
  accountType: "staff" | "hospital_admin";
  role: Role | "";
  fullName: string;
  email: string;
  phone: string;
  department: string;
  tenantId: string;
  hospitalName: string;
  specialization: string;
  licenseNumber: string;
  password: string;
  confirmPassword: string;
};

const emptyForm: FormState = {
  accountType: "staff",
  role: "",
  fullName: "",
  email: "",
  phone: "",
  department: "",
  tenantId: "",
  hospitalName: "",
  specialization: "",
  licenseNumber: "",
  password: "",
  confirmPassword: "",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

type Mode = "signin" | "signup" | "forgot" | "email-sent" | "forgot-sent";

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(
    initialMode === "signup" ? "signup" : "signin",
  );
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [busy, setBusy] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hospitals, setHospitals] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [hospitalsError, setHospitalsError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "signup" || hospitals !== null) return;
    let cancelled = false;
    supabase.rpc("registration_hospitals").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setHospitalsError(error.message);
        setHospitals([]);
        return;
      }
      setHospitals(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [hospitals, mode]);

  const set = (field: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  };

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signinSchema.safeParse({
      email: form.email,
      password: form.password,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path[0], i.message]),
        ),
      );
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setBusy(false);
      toast.error(
        error.message === "Email not confirmed"
          ? "Please confirm your email first — check your inbox for the confirmation link."
          : error.message === "Invalid login credentials"
            ? "Email or password is incorrect."
            : error.message,
      );
      return;
    }

    const [roleRes, employmentRes] = await Promise.all([
      supabase
        .from("user_roles")
        .select("user_id")
        .eq("user_id", data.user.id)
        .limit(1),
      supabase.rpc("my_employment"),
    ]);

    if (roleRes.error || employmentRes.error) {
      const { error: signOutError } = await supabase.auth.signOut();
      setBusy(false);
      if (signOutError) {
        toast.error(signOutError.message);
        return;
      }
      toast.error(roleRes.error?.message ?? employmentRes.error?.message);
      return;
    }

    const hasRole =
      (roleRes.data?.length ?? 0) > 0 ||
      employmentRes.data?.some((employment) =>
        employment.role_names?.includes("hospital_admin"),
      );

    if (!hasRole) {
      const { data: request, error: requestError } = await supabase
        .from("staff_approval_requests")
        .select("status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (requestError) {
        const { error: signOutError } = await supabase.auth.signOut();
        setBusy(false);
        toast.error(signOutError?.message ?? requestError.message);
        return;
      }

      if (request?.status === "pending") {
        setBusy(false);
        navigate({ to: "/staff-pending" });
        return;
      }

      const { data: hospitalRequest, error: hospitalRequestError } =
        await supabase
          .from("hospital_admin_registration_requests")
          .select("status")
          .eq("user_id", data.user.id)
          .maybeSingle();
      if (hospitalRequestError) {
        const { error: signOutError } = await supabase.auth.signOut();
        setBusy(false);
        toast.error(signOutError?.message ?? hospitalRequestError.message);
        return;
      }
      if (hospitalRequest?.status === "pending") {
        setBusy(false);
        navigate({ to: "/staff-pending" });
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut();
      setBusy(false);
      toast.error(
        signOutError?.message ??
          (request?.status === "rejected" ||
          hospitalRequest?.status === "rejected"
            ? "Your access request was not approved."
            : "This is not an approved staff account. Use the patient portal instead."),
      );
      return;
    }

    setBusy(false);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path[0], i.message]),
        ),
      );
      return;
    }
    setBusy(true);
    const d = parsed.data;
    try {
      const { data, error } = await supabase.auth.signUp({
        email: d.email,
        password: d.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            account_type: d.accountType,
            ...(d.accountType === "staff"
              ? { role: d.role, tenant_id: d.tenantId }
              : { hospital_name: d.hospitalName }),
            full_name: d.fullName,
            phone: d.phone,
            department: d.department || null,
            specialization: d.specialization || null,
            license_number: d.licenseNumber || null,
          },
        },
      });
      if (error) {
        const duplicateApplication =
          d.accountType === "hospital_admin" &&
          error.message
            .toLowerCase()
            .includes("hospital_admin_registration_requests_pending_name_key");
        if (duplicateApplication) {
          toast.error(
            "An application for this hospital is already awaiting review.",
          );
          return;
        }
        if (
          error.message.includes("already registered") ||
          error.message.includes("already exists")
        ) {
          toast.error(
            "This email already has an account. Try signing in instead.",
          );
        } else if (/rate limit|too many requests/i.test(error.message)) {
          toast.error(
            "Email sending is temporarily rate-limited. Please wait before trying again, or contact the administrator to configure a custom SMTP provider.",
          );
        } else {
          toast.error(error.message);
        }
        return;
      }
      if (data.session) {
        toast.success(
          d.accountType === "staff"
            ? "Account created. Your hospital must approve your access before you can sign in."
            : "Application submitted for administrator review.",
        );
        navigate({ to: "/staff-pending" });
        return;
      }
      setSentEmail(d.email);
      setMode("email-sent");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not submit your registration. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    const emailCheck = z
      .string()
      .trim()
      .email("Enter a valid email address")
      .safeParse(form.email);
    if (!emailCheck.success) {
      setErrors({ email: "Enter a valid email address" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      form.email.trim(),
      {
        redirectTo: `${window.location.origin}/reset-password?audience=staff`,
      },
    );
    setBusy(false);
    if (error) {
      toast.error("Could not send the reset email. Please try again.");
      return;
    }
    setSentEmail(form.email.trim());
    setMode("forgot-sent");
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left brand panel */}
      <aside className="relative hidden w-[46%] overflow-hidden lg:block">
        <img
          src={heroImage}
          alt="Modern hospital corridor"
          width={1024}
          height={1536}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.25_0.05_200_/_0.85)] via-[oklch(0.3_0.05_200_/_0.25)] to-transparent" />
        <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-[oklch(0.18_0.04_205_/_0.85)] via-[oklch(0.2_0.04_205_/_0.35)] to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="flex w-fit items-center gap-3 rounded-2xl bg-card/95 py-2.5 pr-4 pl-3 shadow-lg backdrop-blur-md">
            <img
              src={logo}
              alt="CanPrecise AI"
              width={154}
              height={83}
              className="h-11 w-auto"
            />
            <span className="border-l border-border pl-3 text-xs leading-snug text-muted-foreground">
              Hospital Management
              <br />
              System
            </span>
          </div>
          <div className="max-w-md">
            <h2 className="font-display text-4xl font-semibold leading-tight text-white">
              One secure doorway for every role in your hospital.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              Clinical and operations staff sign in to a workspace shaped for
              their work.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {ROLES.slice(0, 5).map((r) => (
                <span
                  key={r.value}
                  className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur"
                >
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Right form panel */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="mb-8 lg:hidden">
            <img
              src={logo}
              alt="CanPrecise AI"
              width={154}
              height={83}
              className="h-12 w-auto"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Hospital Management System
            </p>
          </div>

          <div className="mb-6 flex justify-end">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Return to home
            </Link>
          </div>

          {mode === "signin" && (
            <SignInForm
              form={form}
              errors={errors}
              busy={busy}
              showPassword={showPassword}
              onEmail={(v) => set("email")(v)}
              onPassword={(v) => set("password")(v)}
              onTogglePassword={() => setShowPassword((s) => !s)}
              onSubmit={handleSignIn}
              onSwitch={() => {
                setErrors({});
                setMode("signup");
              }}
              onForgot={() => {
                setErrors({});
                setMode("forgot");
              }}
            />
          )}

          {mode === "signup" && (
            <SignUpForm
              form={form}
              errors={errors}
              busy={busy}
              showPassword={showPassword}
              showConfirm={showConfirm}
              hospitals={hospitals}
              hospitalsError={hospitalsError}
              onAccountType={(value) => set("accountType")(value)}
              onRole={(v) => set("role")(v)}
              onField={set}
              onTogglePassword={() => setShowPassword((s) => !s)}
              onToggleConfirm={() => setShowConfirm((s) => !s)}
              onSubmit={handleSignUp}
              onSwitch={() => {
                setErrors({});
                setMode("signin");
              }}
            />
          )}

          {mode === "forgot" && (
            <ForgotForm
              email={form.email}
              busy={busy}
              error={errors.email}
              onEmail={(v) => set("email")(v)}
              onSubmit={handleForgot}
              onBack={() => {
                setErrors({});
                setMode("signin");
              }}
            />
          )}

          {mode === "email-sent" && (
            <EmailSent email={sentEmail} kind="confirm" />
          )}
          {mode === "forgot-sent" && (
            <EmailSent
              email={sentEmail}
              kind="reset"
              onBack={() => {
                setErrors({});
                setMode("signin");
              }}
            />
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Looking for patient access?{" "}
            <Link
              to="/patient-auth"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Go to patient sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/* ---------- Shared bits ---------- */

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-destructive">{message}</p>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  show,
  onToggle,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
  error: string | undefined;
}) {
  return (
    <div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className={`h-11 w-full rounded-xl border bg-card px-4 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
            error ? "border-destructive" : "border-input"
          }`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <FieldError message={error} />
    </div>
  );
}

function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_-12px_var(--hero)] transition hover:bg-primary/90 disabled:opacity-60"
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

function ModeSwitch({
  label,
  question,
  onClick,
}: {
  label: string;
  question: string;
  onClick: () => void;
}) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {question}{" "}
      <button
        type="button"
        onClick={onClick}
        className="font-semibold text-primary underline-offset-4 hover:underline"
      >
        {label}
      </button>
    </p>
  );
}

/* ---------- Sign in ---------- */

function SignInForm(props: {
  form: FormState;
  errors: Partial<Record<keyof FormState, string>>;
  busy: boolean;
  showPassword: boolean;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onTogglePassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSwitch: () => void;
  onForgot: () => void;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Welcome back
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sign in to your CanPreciseAI staff workspace.
      </p>
      <form onSubmit={props.onSubmit} className="mt-7 space-y-4" noValidate>
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-foreground"
            htmlFor="email"
          >
            Work email
          </label>
          <input
            id="email"
            type="email"
            value={props.form.email}
            onChange={(e) => props.onEmail(e.target.value)}
            placeholder="you@hospital.org"
            autoComplete="email"
            className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
              props.errors.email ? "border-destructive" : "border-input"
            }`}
          />
          <FieldError message={props.errors.email} />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="password"
            >
              Password
            </label>
            <button
              type="button"
              onClick={props.onForgot}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            value={props.form.password}
            onChange={props.onPassword}
            placeholder="Your password"
            show={props.showPassword}
            onToggle={props.onTogglePassword}
            error={props.errors.password}
          />
        </div>
        <SubmitButton busy={props.busy}>Sign in</SubmitButton>
      </form>
      <div className="mt-6">
        <ModeSwitch
          question="New to the hospital?"
          label="Register a staff account"
          onClick={props.onSwitch}
        />
      </div>
    </div>
  );
}

/* ---------- Sign up ---------- */

function SignUpForm(props: {
  form: FormState;
  errors: Partial<Record<keyof FormState, string>>;
  busy: boolean;
  showPassword: boolean;
  showConfirm: boolean;
  hospitals: { id: string; name: string }[] | null;
  hospitalsError: string | null;
  onAccountType: (value: FormState["accountType"]) => void;
  onRole: (v: Role) => void;
  onField: (field: keyof FormState) => (v: string) => void;
  onTogglePassword: () => void;
  onToggleConfirm: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSwitch: () => void;
}) {
  const role = props.form.role;
  const isHospitalAdmin = props.form.accountType === "hospital_admin";
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        {isHospitalAdmin
          ? "Apply as a hospital administrator"
          : "Create your staff account"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {isHospitalAdmin
          ? "Register your hospital. A platform administrator will approve one hospital administrator for it."
          : "Register with your work details — your hospital administrator will review your access."}
      </p>
      <form onSubmit={props.onSubmit} className="mt-7 space-y-4" noValidate>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Registration type
          </span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "staff", label: "Hospital staff" },
              { value: "hospital_admin", label: "Hospital administrator" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={props.form.accountType === option.value}
                onClick={() =>
                  props.onAccountType(option.value as FormState["accountType"])
                }
                className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                  props.form.accountType === option.value
                    ? "border-primary bg-secondary text-foreground shadow-[inset_0_0_0_1px_var(--primary)]"
                    : "border-input bg-card text-foreground hover:border-primary/40"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!isHospitalAdmin &&
          props.form.email.trim().toLowerCase() !==
            "prajvalakka021@gmail.com" && (
            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-foreground"
                htmlFor="tenantId"
              >
                Hospital
              </label>
              <select
                id="tenantId"
                value={props.form.tenantId}
                onChange={(e) => props.onField("tenantId")(e.target.value)}
                disabled={
                  props.hospitals === null || props.hospitals.length === 0
                }
                className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50 ${
                  props.errors.tenantId ? "border-destructive" : "border-input"
                }`}
              >
                <option value="">
                  {props.hospitals === null
                    ? "Loading hospitals…"
                    : props.hospitals.length
                      ? "Select your hospital"
                      : "No approved hospitals available"}
                </option>
                {props.hospitals?.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {hospital.name}
                  </option>
                ))}
              </select>
              <FieldError
                message={
                  props.errors.tenantId ?? props.hospitalsError ?? undefined
                }
              />
              {props.hospitals?.length === 0 && !props.hospitalsError && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  No hospitals are accepting staff registrations yet. Apply as a
                  hospital administrator to register a new hospital; central
                  approval will open staff registration for it.
                </p>
              )}
            </div>
          )}

        {isHospitalAdmin && (
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-foreground"
              htmlFor="hospitalName"
            >
              Hospital name
            </label>
            <input
              id="hospitalName"
              type="text"
              maxLength={160}
              value={props.form.hospitalName}
              onChange={(e) => props.onField("hospitalName")(e.target.value)}
              placeholder="City General Hospital"
              className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
                props.errors.hospitalName
                  ? "border-destructive"
                  : "border-input"
              }`}
            />
            <FieldError message={props.errors.hospitalName} />
          </div>
        )}

        {!isHospitalAdmin && (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Your role
              </span>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => props.onRole(r.value)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      role === r.value
                        ? "border-primary bg-secondary shadow-[inset_0_0_0_1px_var(--primary)]"
                        : "border-input bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-foreground">
                      {r.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
                      {r.blurb}
                    </span>
                  </button>
                ))}
              </div>
              <FieldError message={props.errors.role} />
            </div>
          </>
        )}

        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-foreground"
            htmlFor="fullName"
          >
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            value={props.form.fullName}
            onChange={(e) => props.onField("fullName")(e.target.value)}
            placeholder="Dr. Prajval Kumar"
            autoComplete="name"
            className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
              props.errors.fullName ? "border-destructive" : "border-input"
            }`}
          />
          <FieldError message={props.errors.fullName} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-foreground"
              htmlFor="regEmail"
            >
              Work email
            </label>
            <input
              id="regEmail"
              type="email"
              value={props.form.email}
              onChange={(e) => props.onField("email")(e.target.value)}
              placeholder="you@hospital.org"
              autoComplete="email"
              className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
                props.errors.email ? "border-destructive" : "border-input"
              }`}
            />
            <FieldError message={props.errors.email} />
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-foreground"
              htmlFor="phone"
            >
              Mobile number
            </label>
            <input
              id="phone"
              type="tel"
              required
              value={props.form.phone}
              onChange={(e) => props.onField("phone")(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
                props.errors.phone ? "border-destructive" : "border-input"
              }`}
            />
            <FieldError message={props.errors.phone} />
          </div>
        </div>

        {!isHospitalAdmin && role && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-foreground"
                  htmlFor="department"
                >
                  Department{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="department"
                  type="text"
                  value={props.form.department}
                  onChange={(e) => props.onField("department")(e.target.value)}
                  placeholder="General Medicine"
                  className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
                    props.errors.department
                      ? "border-destructive"
                      : "border-input"
                  }`}
                />
                <FieldError message={props.errors.department} />
              </div>
              {role === "doctor" && (
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium text-foreground"
                    htmlFor="specialization"
                  >
                    Specialisation
                  </label>
                  <input
                    id="specialization"
                    type="text"
                    value={props.form.specialization}
                    onChange={(e) =>
                      props.onField("specialization")(e.target.value)
                    }
                    placeholder="Cardiology"
                    className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
                      props.errors.specialization
                        ? "border-destructive"
                        : "border-input"
                    }`}
                  />
                  <FieldError message={props.errors.specialization} />
                </div>
              )}
            </div>
            {needsLicense(role) && (
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-foreground"
                  htmlFor="licenseNumber"
                >
                  Registration / licence number
                </label>
                <input
                  id="licenseNumber"
                  type="text"
                  value={props.form.licenseNumber}
                  onChange={(e) =>
                    props.onField("licenseNumber")(e.target.value)
                  }
                  placeholder="e.g. MCI-2019-45210"
                  className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
                    props.errors.licenseNumber
                      ? "border-destructive"
                      : "border-input"
                  }`}
                />
                <FieldError message={props.errors.licenseNumber} />
              </div>
            )}
          </>
        )}

        <PasswordInput
          value={props.form.password}
          onChange={props.onField("password")}
          placeholder="Password (8+ characters)"
          show={props.showPassword}
          onToggle={props.onTogglePassword}
          error={props.errors.password}
        />
        <PasswordInput
          value={props.form.confirmPassword}
          onChange={props.onField("confirmPassword")}
          placeholder="Confirm password"
          show={props.showConfirm}
          onToggle={props.onToggleConfirm}
          error={props.errors.confirmPassword}
        />

        <SubmitButton busy={props.busy}>
          {isHospitalAdmin ? "Submit hospital application" : "Create account"}
        </SubmitButton>
      </form>
      <div className="mt-6">
        <ModeSwitch
          question="Already registered?"
          label="Sign in"
          onClick={props.onSwitch}
        />
      </div>
    </div>
  );
}

/* ---------- Forgot password ---------- */

function ForgotForm(props: {
  email: string;
  busy: boolean;
  error: string | undefined;
  onEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <button
        type="button"
        onClick={props.onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sign in
      </button>
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter your work email and we'll send you a secure reset link.
      </p>
      <form onSubmit={props.onSubmit} className="mt-7 space-y-4" noValidate>
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-foreground"
            htmlFor="forgotEmail"
          >
            Work email
          </label>
          <input
            id="forgotEmail"
            type="email"
            value={props.email}
            onChange={(e) => props.onEmail(e.target.value)}
            placeholder="you@hospital.org"
            autoComplete="email"
            className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
              props.error ? "border-destructive" : "border-input"
            }`}
          />
          <FieldError message={props.error} />
        </div>
        <SubmitButton busy={props.busy}>Send reset link</SubmitButton>
      </form>
    </div>
  );
}

/* ---------- Sent screens ---------- */

function EmailSent({
  email,
  kind,
  onBack,
}: {
  email: string;
  kind: "confirm" | "reset";
  onBack?: () => void;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary">
        {kind === "confirm" ? (
          <MailCheck className="size-7 text-secondary-foreground" />
        ) : (
          <CheckCircle2 className="size-7 text-secondary-foreground" />
        )}
      </div>
      <h1 className="mt-5 font-display text-xl font-semibold text-foreground">
        {kind === "confirm" ? "Check your inbox" : "Reset link sent"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        We sent a {kind === "confirm" ? "confirmation" : "password reset"} link
        to <span className="font-semibold text-foreground">{email}</span>. Open
        it on this device to
        {kind === "confirm"
          ? " activate your account, then sign in."
          : " choose a new password."}
      </p>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex h-10 items-center rounded-xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent"
        >
          Back to sign in
        </button>
      )}
    </div>
  );
}
