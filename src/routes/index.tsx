import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import logo from "@/assets/canprecise-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CanPreciseAI HMIS — Hospital Management Information System" },
      {
        name: "description",
        content:
          "Separate secure portals for CanPreciseAI patients and hospital staff.",
      },
      {
        property: "og:title",
        content: "CanPreciseAI HMIS — Hospital Management Information System",
      },
      {
        property: "og:description",
        content: "Secure access for patients and hospital staff.",
      },
      { property: "og:type", content: "website" },
      { property: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="landing-background relative flex min-h-screen flex-col overflow-hidden px-5 pt-6 pb-4 sm:px-8 lg:px-12">
      <header className="relative z-10 mx-auto flex w-full max-w-[1130px] items-center justify-between gap-4">
        <img
          src={logo}
          alt="CanPrecise AI"
          width={154}
          height={83}
          className="h-16 w-auto"
        />
        <div className="flex items-center gap-2.5 rounded-full border border-border bg-card/70 py-1.5 pr-4 pl-2 shadow-sm backdrop-blur-sm">
          <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <span className="text-xs font-semibold text-foreground">
            Secure access
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · Patients &amp; staff
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1130px] flex-1 py-10 lg:py-14">
        <section className="mx-auto max-w-[820px] text-center">
          <h1 className="mx-auto max-w-[680px] font-display text-[clamp(2.5rem,4.6vw,4rem)] leading-[1.04] font-semibold tracking-[-0.035em] text-foreground">
            Better care begins with{" "}
            <span className="text-primary">better clarity.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[470px] text-base leading-relaxed text-muted-foreground">
            Choose the right space for you. Patients can manage their care
            access, while hospital teams get tools tailored to their roles.
          </p>

          <div className="mx-auto mt-9 grid max-w-[680px] gap-4 text-left sm:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <UserRound className="size-5" />
              </div>
              <h2 className="font-display text-base font-semibold text-foreground">
                Patient portal
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Your personal space to access care with CanPreciseAI.
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
                <Link
                  to="/patient-auth"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Patient sign in <ArrowRight className="size-3.5" />
                </Link>
                <Link
                  to="/patient-auth"
                  search={{ mode: "signup" }}
                  className="text-[13px] font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Create account
                </Link>
              </div>
            </div>

            <div className="flex flex-col rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <Stethoscope className="size-5" />
              </div>
              <h2 className="font-display text-base font-semibold text-foreground">
                Staff workspace
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Secure tools for clinical and hospital operations teams.
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
                <Link
                  to="/auth"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Staff sign in <ArrowRight className="size-3.5" />
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="text-[13px] font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Register staff
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
