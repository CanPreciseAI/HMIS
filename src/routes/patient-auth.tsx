import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  HeartPulse,
  Loader2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/auth-hero.jpg";
import logo from "@/assets/canprecise-logo.png";

export const Route = createFileRoute("/patient-auth")({
  validateSearch: z.object({
    mode: z.enum(["signin", "signup"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Patient portal — CanPreciseAI" },
      {
        name: "description",
        content: "Sign in or create your secure CanPreciseAI patient account.",
      },
    ],
  }),
  component: PatientAuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(1, "Enter your password"),
});

const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(100),
    email: z.string().trim().email("Enter a valid email address").max(255),
    phone: z
      .string()
      .trim()
      .regex(/^[+\d][\d\s\-()]{5,19}$/, "Enter a valid phone number"),
    password: z.string().min(8, "Use at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .superRefine((form, ctx) => {
    if (form.password !== form.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

type PatientForm = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const emptyForm: PatientForm = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

type FormMode = "signin" | "signup" | "forgot" | "email-sent";
type PatientField = keyof PatientForm;

function PatientAuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<FormMode>(
    initialMode === "signup" ? "signup" : "signin",
  );
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<PatientField, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const setField = (field: PatientField) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    const parsed = signInSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
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
          ? "Please confirm your email first — check your inbox."
          : error.message === "Invalid login credentials"
            ? "Email or password is incorrect."
            : error.message,
      );
      return;
    }

    const { data: patient, error: profileError } = await supabase
      .from("patient_profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !patient) {
      const { error: signOutError } = await supabase.auth.signOut();
      setBusy(false);
      if (signOutError) {
        toast.error(signOutError.message);
        return;
      }
      toast.error(
        profileError?.message ??
          "This is not a patient account. Use the staff sign-in instead.",
      );
      return;
    }

    setBusy(false);
    toast.success("Welcome to your patient portal");
    navigate({ to: "/patient" });
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      return;
    }

    setBusy(true);
    const patient = parsed.data;
    const { data, error } = await supabase.auth.signUp({
      email: patient.email,
      password: patient.password,
      options: {
        emailRedirectTo: `${window.location.origin}/patient-auth`,
        data: {
          account_type: "patient",
          full_name: patient.fullName,
          phone: patient.phone,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("already registered") ||
          error.message.includes("already exists")
          ? "This email already has an account. Try signing in instead."
          : error.message,
      );
      return;
    }

    if (data.session) {
      toast.success("Patient account created");
      navigate({ to: "/patient" });
      return;
    }

    setSentEmail(patient.email);
    setMode("email-sent");
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    const parsed = z
      .string()
      .trim()
      .email("Enter a valid email address")
      .safeParse(form.email);
    if (!parsed.success) {
      setErrors({
        email: parsed.error.issues[0]?.message ?? "Enter a valid email address",
      });
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password?audience=patient`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSentEmail(parsed.data);
    setMode("email-sent");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden w-[46%] overflow-hidden lg:block">
        <img
          src={heroImage}
          alt="Modern hospital corridor"
          width={1024}
          height={1536}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.25_0.05_200_/_0.9)] via-[oklch(0.3_0.05_200_/_0.35)] to-transparent" />
        <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-[oklch(0.18_0.04_205_/_0.85)] via-[oklch(0.2_0.04_205_/_0.35)] to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Link
            to="/"
            className="w-fit rounded-2xl bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md"
          >
            <img
              src={logo}
              alt="CanPrecise AI"
              width={154}
              height={83}
              className="h-10 w-auto"
            />
          </Link>
          <div className="max-w-md">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
              <UserRound className="size-3.5" /> Patient portal
            </span>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white">
              Your care journey, in one secure place.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              Create a personal account to securely access the patient portal.
              Staff accounts use a separate workspace.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" className="lg:hidden">
              <img
                src={logo}
                alt="CanPrecise AI"
                width={154}
                height={83}
                className="h-12 w-auto"
              />
            </Link>
            <Link
              to="/"
              className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Home
            </Link>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => {
                setErrors({});
                setMode("signin");
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === "signin" || mode === "forgot"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Patient sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setErrors({});
                setMode("signup");
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Create account
            </button>
          </div>

          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-5" noValidate>
              <div>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Welcome back
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Sign in to your personal patient account.
                </p>
              </div>
              <PatientInput
                id="patient-email"
                label="Email address"
                type="email"
                value={form.email}
                onChange={setField("email")}
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email}
              />
              <PasswordField
                id="patient-password"
                label="Password"
                value={form.password}
                onChange={setField("password")}
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                error={errors.password}
              />
              <button
                type="button"
                onClick={() => {
                  setErrors({});
                  setMode("forgot");
                }}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
              <SubmitButton busy={busy}>Sign in to patient portal</SubmitButton>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4" noValidate>
              <div className="mb-5">
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Create your patient account
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Use your personal details. No staff role or work credentials
                  are needed.
                </p>
              </div>
              <PatientInput
                id="patient-name"
                label="Full name"
                type="text"
                value={form.fullName}
                onChange={setField("fullName")}
                placeholder="Your full name"
                autoComplete="name"
                error={errors.fullName}
              />
              <PatientInput
                id="patient-signup-email"
                label="Email address"
                type="email"
                value={form.email}
                onChange={setField("email")}
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email}
              />
              <PatientInput
                id="patient-phone"
                label="Mobile number"
                type="tel"
                value={form.phone}
                onChange={setField("phone")}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                required
                error={errors.phone}
              />
              <PasswordField
                id="patient-new-password"
                label="Password"
                value={form.password}
                onChange={setField("password")}
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                error={errors.password}
              />
              <PasswordField
                id="patient-confirm-password"
                label="Confirm password"
                value={form.confirmPassword}
                onChange={setField("confirmPassword")}
                show={showConfirm}
                onToggle={() => setShowConfirm((value) => !value)}
                error={errors.confirmPassword}
              />
              <SubmitButton busy={busy}>Create patient account</SubmitButton>
              <p className="text-xs leading-relaxed text-muted-foreground">
                We’ll send a confirmation link to your email before you can sign
                in.
              </p>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-5" noValidate>
              <div>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Reset your password
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  We’ll email a secure reset link if an account matches.
                </p>
              </div>
              <PatientInput
                id="patient-reset-email"
                label="Email address"
                type="email"
                value={form.email}
                onChange={setField("email")}
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email}
              />
              <SubmitButton busy={busy}>Send reset link</SubmitButton>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            </form>
          )}

          {mode === "email-sent" && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <HeartPulse className="size-5" />
              </div>
              <h2 className="font-display text-xl font-semibold text-foreground">
                Check your email
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If an account can be confirmed for{" "}
                <span className="font-medium text-foreground">{sentEmail}</span>
                , you’ll receive a secure link shortly.
              </p>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="mt-5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                Return to patient sign in
              </button>
            </div>
          )}

          <p className="mt-7 text-center text-sm text-muted-foreground">
            Hospital staff?{" "}
            <Link
              to="/auth"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Go to staff sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function PatientInput({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = false,
  error,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  required?: boolean;
  error: string | undefined;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={`h-11 w-full rounded-xl border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50 ${
          error ? "border-destructive" : "border-input"
        }`}
      />
      {error && (
        <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  error: string | undefined;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={
            id.includes("new") || id.includes("confirm")
              ? "new-password"
              : "current-password"
          }
          className={`h-11 w-full rounded-xl border bg-card px-4 pr-11 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/50 ${
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
      {error && (
        <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>
      )}
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
