import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/canprecise-logo.png";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({
    audience: z.enum(["patient", "staff"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Reset password — CanPreciseAI" },
      {
        name: "description",
        content: "Choose a new password for your CanPreciseAI account.",
      },
      { property: "og:title", content: "Reset password — CanPreciseAI" },
      {
        property: "og:description",
        content: "Choose a new password for your CanPreciseAI account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { audience } = Route.useSearch();
  const navigate = useNavigate();
  const signInRoute = audience === "patient" ? "/patient-auth" : "/auth";
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery payload in the URL hash: #access_token=...&type=recovery
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setValid(hash.get("type") === "recovery" && !!hash.get("access_token"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = z
      .object({
        password: z.string().min(8, "Use at least 8 characters").max(72),
        confirm: z.string(),
      })
      .refine((d) => d.password === d.confirm, {
        path: ["confirm"],
        message: "Passwords do not match",
      });
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Something went wrong");
      return;
    }
    setBusy(true);
    // Recovery sessions are exempt — never send current_password here.
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    setBusy(false);
    if (updateError) {
      setError(
        "Could not update the password. The link may have expired — request a new one.",
      );
      return;
    }
    setError("");
    setDone(true);
    setTimeout(() => navigate({ to: signInRoute }), 2500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <img
          src={logo}
          alt="CanPrecise AI"
          width={154}
          height={83}
          className="h-11 w-auto"
        />

        {valid === null && (
          <p className="mt-8 text-sm text-muted-foreground">
            Checking your reset link…
          </p>
        )}

        {valid === false && (
          <>
            <h1 className="mt-8 font-display text-xl font-semibold text-foreground">
              Link not valid
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This reset link is missing or has expired. Request a fresh one
              from the sign-in page.
            </p>
            <a
              href={signInRoute}
              className="mt-6 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Back to sign in
            </a>
          </>
        )}

        {valid === true && !done && (
          <>
            <h1 className="mt-8 font-display text-xl font-semibold text-foreground">
              Set a new password
            </h1>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-foreground"
                  htmlFor="newPassword"
                >
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ characters"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50"
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-foreground"
                  htmlFor="confirmNew"
                >
                  Confirm new password
                </label>
                <input
                  id="confirmNew"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/50"
                />
              </div>
              {error && (
                <p className="text-xs font-medium text-destructive">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Update password
              </button>
            </form>
          </>
        )}

        {valid === true && done && (
          <div className="mt-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary">
              <ShieldCheck className="size-7 text-secondary-foreground" />
            </div>
            <h1 className="mt-5 font-display text-xl font-semibold text-foreground">
              Password updated
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Taking you to sign in…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
