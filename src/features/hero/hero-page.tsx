import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  BedDouble,
  Check,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Menu,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import logo from "@/assets/canprecise-logo-DKiSxahp.png";
import { DnaHelix } from "@/features/hero/dna-helix";
import { ContactSection } from "@/features/hero/contact-section";
import { SiteFooter } from "@/features/hero/site-footer";
import { Button as StatefulButton } from "@/components/ui/stateful-button";
import { Highlight } from "@/components/ui/hero-highlight";
import { GlowingEffect } from "@/components/ui/glowing-effect";

const flowBars = [42, 58, 48, 72, 64, 86, 74, 92, 68, 80, 56, 70];

const capabilities = [
  {
    icon: Stethoscope,
    title: "Clinical command",
    body: "Consultations, encounters, prescriptions and results in one continuous thread.",
  },
  {
    icon: BedDouble,
    title: "Ward intelligence",
    body: "Beds, admissions and handoffs stay visible to the teams who need them.",
  },
  {
    icon: FlaskConical,
    title: "Lab & pharmacy loop",
    body: "Orders, samples and dispenses move forward without a second phone call.",
  },
];

const navItems = [
  { id: "platform", label: "Platform" },
  { id: "workflow", label: "Workflow" },
  { id: "security", label: "Security" },
];

function scrollToSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  const top = section.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top, behavior: "smooth" });
  window.history.replaceState(null, "", `#${id}`);
}

function HeroNav() {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sections = navItems
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: [0.1, 0.4, 0.75] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const go = (id: string) => {
    setActive(id);
    setOpen(false);
    scrollToSection(id);
  };

  return (
    <header className="relative z-30 mx-auto w-full max-w-[1240px] px-4 pt-4 sm:px-8 lg:px-10">
      <div className="relative flex items-center justify-between gap-3">
        <Link
          to="/"
          className="flex shrink-0 items-center"
          aria-label="CanPreciseAI home"
        >
          <span className="inline-flex rounded-2xl bg-white px-3 py-2 shadow-[0_14px_40px_-16px_rgba(103,232,249,0.65)] ring-1 ring-white/20">
            <img
              src={logo}
              alt="CanPreciseAI"
              width={154}
              height={83}
              className="h-10 w-auto object-contain sm:h-11"
            />
          </span>
        </Link>

        <nav
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex"
          aria-label="Primary"
        >
          <div className="flex items-center gap-0.5 rounded-full border border-white/12 bg-white/[0.06] p-1 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            {navItems.map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-300 ${
                    isActive
                      ? "bg-white text-[#071022] shadow-[0_8px_20px_-10px_rgba(255,255,255,0.65)]"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/patient-auth"
            className="hidden h-9 items-center rounded-full border border-white/10 px-4 text-[13px] font-medium text-white/70 transition hover:border-white/25 hover:text-white lg:inline-flex"
          >
            Patient portal
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#071022] transition hover:bg-cyan-50"
          >
            Staff sign in
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-9 place-items-center rounded-full border border-white/12 bg-white/[0.05] text-white/70 backdrop-blur transition hover:text-white lg:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 lg:hidden">
          <nav
            aria-label="Primary mobile"
            className="flex flex-col gap-0.5 rounded-2xl border border-white/10 bg-[#071022]/95 p-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl"
          >
            {navItems.map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`rounded-xl px-4 py-2.5 text-left text-[13px] font-medium transition ${
                    isActive
                      ? "bg-white text-[#071022]"
                      : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <Link
              to="/patient-auth"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white"
            >
              Patient portal
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

function FlowNode({
  index,
  title,
  role,
  body,
  open,
  onToggle,
}: {
  index: string;
  title: string;
  role: string;
  body: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`group relative w-full rounded-2xl border p-4 text-left transition duration-300 ${
        open
          ? "border-cyan-300/35 bg-[#0c1d38] shadow-[0_24px_60px_-40px_rgba(34,211,238,0.8)]"
          : "border-white/10 bg-[#0a1830]/80 hover:border-cyan-300/25 hover:bg-[#0a1830]"
      }`}
    >
      <GlowingEffect proximity={44} spread={26} glow={!open} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold tracking-[0.18em] text-cyan-200/50">
          {index}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium text-white/45">
          {role}
        </span>
      </div>
      <p className="mt-2 font-display text-sm font-medium text-white">
        {title}
      </p>
      <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-cyan-200/50 transition group-hover:text-cyan-200/80">
        {open ? "Hide detail" : "View detail"}
        <ChevronDown
          className={`size-3 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </span>
      {open && (
        <p className="mt-2 text-[11px] leading-relaxed text-white/50">{body}</p>
      )}
    </button>
  );
}

function WorkflowFlow() {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) =>
    setOpen((current) => (current === id ? null : id));

  return (
    <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1.1fr_auto_1fr] lg:items-center lg:gap-2">
      <FlowNode
        index="01"
        title="Intake"
        role="Reception"
        body="Registration, vitals and history open the encounter."
        open={open === "01"}
        onToggle={() => toggle("01")}
      />
      <FlowConnector />
      <FlowNode
        index="02"
        title="Consultation"
        role="Doctors"
        body="Review, diagnosis and the clinical note."
        open={open === "02"}
        onToggle={() => toggle("02")}
      />
      <FlowConnector branch />
      <div className="grid gap-3">
        <FlowNode
          index="03"
          title="Laboratory"
          role="Laboratory"
          body="Orders, samples and results attach to the visit."
          open={open === "03"}
          onToggle={() => toggle("03")}
        />
        <FlowNode
          index="04"
          title="Pharmacy"
          role="Pharmacy"
          body="Prescriptions are dispensed from the same record."
          open={open === "04"}
          onToggle={() => toggle("04")}
        />
      </div>
      <FlowConnector />
      <FlowNode
        index="05"
        title="Billing"
        role="Billing"
        body="Charges from every step land on one invoice."
        open={open === "05"}
        onToggle={() => toggle("05")}
      />
    </div>
  );
}

function FlowConnector({ branch = false }: { branch?: boolean }) {
  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      <span className="hidden place-items-center lg:grid">
        {branch ? (
          <span className="flex flex-col gap-0.5">
            <ChevronRight className="size-3.5 text-cyan-300/45" />
            <ChevronRight className="size-3.5 text-cyan-300/25" />
          </span>
        ) : (
          <ChevronRight className="size-3.5 text-cyan-300/45" />
        )}
      </span>
      <ChevronDown className="size-4 text-cyan-300/40 lg:hidden" />
    </div>
  );
}

function StatLine({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-medium tracking-tight text-white">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-white/45">{hint}</p>
    </div>
  );
}

export function HeroPage() {
  const navigate = useNavigate();

  const enter = (to: "/auth" | "/patient-auth") => async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    window.setTimeout(() => void navigate({ to }), 360);
  };

  return (
    <div className="cp-hero relative min-h-screen overflow-clip bg-[#030814] text-[#f2f7ff]">
      <div
        className="cp-hero-glow-a pointer-events-none absolute"
        aria-hidden
      />
      <div
        className="cp-hero-glow-b pointer-events-none absolute"
        aria-hidden
      />
      <div
        className="cp-hero-halftone pointer-events-none absolute"
        aria-hidden
      />
      <div className="cp-hero-grain pointer-events-none absolute" aria-hidden />

      <div className="cp-hero-dna pointer-events-none absolute" aria-hidden>
        <DnaHelix />
      </div>

      <svg
        aria-hidden="true"
        className="cp-hero-silk pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1440 980"
        fill="none"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="cp-silk" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5eead4" stopOpacity="0" />
            <stop offset="0.45" stopColor="#67e8f9" stopOpacity="0.75" />
            <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="cp-silk-line"
          d="M-140 700C140 560 300 800 600 660S980 300 1580 440"
          stroke="url(#cp-silk)"
          strokeWidth="1.2"
        />
        <path
          className="cp-silk-line cp-silk-line-slow"
          d="M-120 520C220 430 380 620 700 500S1080 220 1560 330"
          stroke="url(#cp-silk)"
          strokeWidth="0.8"
          opacity="0.65"
        />
        <path
          className="cp-silk-line cp-silk-line-fast"
          d="M-160 860C200 760 420 900 760 760S1180 500 1580 600"
          stroke="url(#cp-silk)"
          strokeWidth="0.7"
          opacity="0.5"
        />
      </svg>

      <HeroNav />

      <main className="relative z-10 mx-auto grid w-full max-w-[1240px] items-center gap-14 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:px-10 lg:pt-16 xl:pt-20">
        <section className="max-w-[620px]">
          <h1 className="font-display text-[clamp(2.8rem,6vw,5.1rem)] leading-[0.96] font-medium tracking-[-0.045em] text-white">
            Every patient,
            <br />
            every handoff,
            <br />
            <Highlight className="cp-serif text-[0.94em] italic tracking-[-0.02em] text-cyan-200">
              in perfect focus.
            </Highlight>
          </h1>

          <p className="mt-6 max-w-[480px] text-[15px] leading-relaxed text-white/55 sm:text-base">
            A calm, connected command centre for the people who keep a hospital
            moving — from the first consultation to the final dispense.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <StatefulButton
              onClick={enter("/auth")}
              loadingLabel="Opening workspace…"
              successLabel="Workspace ready"
              className="min-w-[13.5rem]"
            >
              Enter staff workspace
              <ChevronRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </StatefulButton>
            <StatefulButton
              variant="outline"
              onClick={enter("/patient-auth")}
              loadingLabel="Opening portal…"
              successLabel="Portal ready"
              className="min-w-[11rem] font-medium"
            >
              <UserRound className="size-4" aria-hidden="true" />
              Patient portal
            </StatefulButton>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/40">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-cyan-300/70" />
              Role-based access
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Activity className="size-3.5 text-cyan-300/70" />
              Live clinical data
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-cyan-300/70" />
              One source of truth
            </span>
          </div>

          <div className="mt-12 grid max-w-[480px] grid-cols-3 gap-5 border-t border-white/8 pt-5">
            <StatLine label="Care roles" value="06" hint="One workspace each" />
            <StatLine label="Handoffs" value="<2m" hint="From order to queue" />
            <StatLine
              label="Visibility"
              value="24/7"
              hint="Across the hospital"
            />
          </div>
        </section>

        <section
          className="cp-hero-stage relative mx-auto w-full max-w-[620px]"
          aria-label="CanPreciseAI command centre preview"
        >
          <div className="cp-hero-halo absolute" aria-hidden />
          <div
            className="cp-hero-dot-ring absolute hidden sm:block"
            aria-hidden
          />

          <div className="cp-hero-dashboard relative">
            <div className="relative rounded-[26px] border border-white/10 bg-[#071022]/90 p-2 shadow-[0_60px_140px_-40px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
              <GlowingEffect proximity={70} spread={46} />
              <div className="rounded-[20px] border border-white/8 bg-[linear-gradient(160deg,#0a1830_0%,#071022_55%,#050b18_100%)] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-rose-400/70" />
                    <span className="size-2 rounded-full bg-amber-300/70" />
                    <span className="size-2 rounded-full bg-emerald-300/70" />
                    <p className="ml-2 text-[10px] font-medium tracking-[0.14em] text-white/35 uppercase">
                      Command centre
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                    <span className="cp-pulse-dot size-1 rounded-full bg-emerald-300" />
                    Live
                  </span>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-white/40">
                      Good morning, Dr. Rao
                    </p>
                    <p className="mt-1 font-display text-xl font-medium tracking-tight text-white">
                      Today at a glance
                    </p>
                  </div>
                  <p className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[9px] font-medium text-white/45">
                    Wed · 20 Nov
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Encounters", "128", "+12 today"],
                    ["Bed use", "82%", "14 free"],
                    ["Lab queue", "34m", "9 pending"],
                  ].map(([label, value, hint]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/8 bg-white/[0.035] p-2.5"
                    >
                      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/35">
                        {label}
                      </p>
                      <p className="mt-1 font-display text-lg font-medium text-white">
                        {value}
                      </p>
                      <p className="text-[8px] text-white/35">{hint}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-medium text-white/60">
                      Patient flow
                    </p>
                    <p className="text-[8px] text-white/30">Last 12 days</p>
                  </div>
                  <div className="mt-3 flex h-16 items-end gap-1">
                    {flowBars.map((height, index) => (
                      <span
                        key={index}
                        className="cp-hero-bar flex-1 rounded-t-[3px] bg-gradient-to-t from-cyan-400/15 to-cyan-300/70"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-medium text-white/60">
                      Ward watch
                    </p>
                    <p className="text-[8px] text-white/30">Live</p>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {[
                      ["Ward 3", "4 beds free", "emerald"],
                      ["Ward 5", "2 discharges due", "amber"],
                    ].map(([ward, note, tone]) => (
                      <div
                        key={ward}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <BedDouble className="size-3 text-cyan-200/60" />
                          <span className="text-[9px] font-medium text-white/70">
                            {ward}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 text-[8px] ${
                            tone === "emerald"
                              ? "text-emerald-200/80"
                              : "text-amber-200/80"
                          }`}
                        >
                          <span
                            className={`size-1 rounded-full ${
                              tone === "emerald"
                                ? "bg-emerald-300"
                                : "bg-amber-300"
                            }`}
                          />
                          {note}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="cp-hero-chip cp-hero-chip-a absolute -left-3 top-[18%] hidden items-center gap-2 rounded-xl border border-white/10 bg-[#0a1830]/90 px-3 py-2 shadow-xl backdrop-blur-xl sm:flex">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-300/10 text-emerald-200">
              <Check className="size-3.5" />
            </span>
            <span>
              <span className="block text-[9px] font-semibold text-white/80">
                Critical result reviewed
              </span>
              <span className="block text-[8px] text-white/35">
                Dr. Rao · 2m ago
              </span>
            </span>
          </div>

          <div className="cp-hero-chip cp-hero-chip-b absolute -right-2 bottom-[16%] hidden items-center gap-2 rounded-xl border border-white/10 bg-[#0a1830]/90 px-3 py-2 shadow-xl backdrop-blur-xl sm:flex">
            <span className="grid size-7 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">
              <Pill className="size-3.5" />
            </span>
            <span>
              <span className="block text-[9px] font-semibold text-white/80">
                12 prescriptions ready
              </span>
              <span className="block text-[8px] text-white/35">
                Pharmacy queue
              </span>
            </span>
          </div>
        </section>
      </main>

      <div className="relative z-10 overflow-hidden border-y border-white/8 bg-white/[0.02] py-3">
        <div className="cp-marquee flex w-max items-center gap-8 whitespace-nowrap">
          {[0, 1].map((pass) => (
            <div
              key={pass}
              className="flex items-center gap-8"
              aria-hidden={pass === 1}
            >
              {[
                "CLINICAL",
                "WARDS",
                "LABORATORY",
                "PHARMACY",
                "BILLING",
                "INSURANCE",
                "ADMISSIONS",
                "PRESCRIPTIONS",
              ].map((item) => (
                <span
                  key={`${pass}-${item}`}
                  className="inline-flex items-center gap-8 text-[10px] font-semibold tracking-[0.24em] text-white/25"
                >
                  {item}
                  <span className="size-1 rounded-full bg-cyan-300/30" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section
        id="platform"
        className="relative z-10 mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10"
      >
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/60">
              The platform
            </p>
            <h2 className="mt-3 max-w-[620px] font-display text-3xl font-medium tracking-[-0.03em] text-white sm:text-4xl">
              One system for every corner of care.
            </h2>
          </div>
          <p className="max-w-[340px] text-sm leading-relaxed text-white/45">
            Purpose-built views for each role, connected by the same patient
            record and the same operational truth.
          </p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {capabilities.map((item) => (
            <article
              key={item.title}
              className="group relative rounded-2xl border border-white/8 bg-white/[0.025] p-6 transition hover:border-cyan-300/20 hover:bg-white/[0.045]"
            >
              <GlowingEffect proximity={56} spread={34} />
              <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-cyan-200/80">
                <item.icon className="size-[18px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-medium text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/45">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="workflow"
        className="relative z-10 border-y border-white/8 bg-[linear-gradient(180deg,rgba(8,24,46,0.55),rgba(3,8,20,0.9))]"
      >
        <div className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[720px] text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/60">
              The workflow
            </p>
            <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3.2rem)] font-medium leading-[1.05] tracking-[-0.04em] text-white">
              Every handoff lands <br className="hidden sm:block" />
              <Highlight className="text-white">in the same record.</Highlight>
            </h2>
            <p className="mx-auto mt-5 max-w-[560px] text-sm leading-relaxed text-white/45 sm:text-[15px]">
              Doctors, nurses, laboratory, pharmacy and billing write into one
              encounter, so the next team starts exactly where the last one
              finished.
            </p>
          </div>

          <div className="mt-16 rounded-[26px] border border-white/8 bg-[#071022]/40 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                Patient flow
              </p>
              <p className="text-[10px] text-white/25">
                One encounter · every hand
              </p>
            </div>

            <WorkflowFlow />
          </div>

          <p className="mx-auto mt-8 max-w-[540px] text-center text-[11px] leading-relaxed text-white/30">
            Laboratory and pharmacy work in parallel, then merge into billing —
            nothing is re-entered along the way.
          </p>
        </div>
      </section>

      <section
        id="security"
        className="relative z-10 mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10"
      >
        <div className="cp-security-card relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(120deg,rgba(8,24,46,0.95),rgba(4,10,22,0.95))] p-8 sm:p-12">
          <GlowingEffect proximity={90} spread={48} />
          <div
            className="cp-hero-halftone-small pointer-events-none absolute"
            aria-hidden
          />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-[620px]">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/60">
                <ShieldCheck className="size-4" />
                Access by design
              </p>
              <h2 className="mt-4 font-display text-3xl font-medium tracking-[-0.03em] text-white sm:text-4xl">
                Role-aware from the first click.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/45">
                Doctors, nurses, laboratory teams, pharmacists, reception and
                administrators each get the view they need — and only that.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Doctors",
                "Nurses",
                "Laboratory",
                "Pharmacy",
                "Reception",
                "Administration",
              ].map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/55"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ContactSection />

      <SiteFooter />
    </div>
  );
}
