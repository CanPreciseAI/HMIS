import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import logo from "@/assets/canprecise-logo-DKiSxahp.png";

type FooterLink = {
  label: string;
  href?: string;
  to?: "/auth" | "/patient-auth" | "/reset-password";
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const columns: FooterColumn[] = [
  {
    title: "Platform",
    links: [
      { label: "Clinical command", href: "#platform" },
      { label: "Ward intelligence", href: "#platform" },
      { label: "Lab & pharmacy loop", href: "#platform" },
    ],
  },
  {
    title: "Workflow",
    links: [
      { label: "Admit", href: "#workflow" },
      { label: "Diagnose", href: "#workflow" },
      { label: "Prescribe", href: "#workflow" },
      { label: "Dispense", href: "#workflow" },
      { label: "Bill", href: "#workflow" },
    ],
  },
  {
    title: "Roles",
    links: [
      { label: "Doctors", href: "#security" },
      { label: "Nurses", href: "#security" },
      { label: "Laboratory", href: "#security" },
      { label: "Pharmacy", href: "#security" },
      { label: "Reception", href: "#security" },
      { label: "Administration", href: "#security" },
    ],
  },
  {
    title: "Access",
    links: [
      { label: "Staff sign in", to: "/auth" },
      { label: "Patient portal", to: "/patient-auth" },
      { label: "Reset password", to: "/reset-password" },
    ],
  },
];

const linkClass = "text-[13px] text-white/45 transition hover:text-white";

function FooterItem({ link }: { link: FooterLink }) {
  if (link.to) {
    return (
      <Link to={link.to} className={linkClass}>
        {link.label}
      </Link>
    );
  }

  return (
    <a href={link.href} className={linkClass}>
      {link.label}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 overflow-hidden border-t border-white/8 bg-[#030814]">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-16 sm:px-8 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] lg:gap-8">
          <div className="max-w-[320px]">
            <span className="inline-flex rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-white/15">
              <img
                src={logo}
                alt="CanPreciseAI"
                width={154}
                height={83}
                className="h-8 w-auto object-contain"
              />
            </span>
            <p className="mt-4 text-[13px] leading-relaxed text-white/45">
              Precision hospital operations. A calm, connected command centre
              for clinical, ward, laboratory, pharmacy and billing teams.
            </p>
            <Link
              to="/auth"
              className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-cyan-200/80 transition hover:text-cyan-100"
            >
              Enter staff workspace
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterItem link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/8 pt-6 text-[11px] text-white/30 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CanPreciseAI</p>
          <p className="text-white/25">
            One patient record · six roles · one operational truth
          </p>
        </div>
      </div>

      <div className="relative mt-6 sm:mt-8" aria-hidden="true">
        <p className="cp-footer-wordmark px-4 text-center font-display font-semibold leading-[0.78] tracking-[-0.055em] text-[clamp(3.6rem,16vw,15rem)] bg-gradient-to-b from-white/85 via-white/35 to-white/[0.04] bg-clip-text text-transparent">
          CanPreciseAI
        </p>
      </div>
    </footer>
  );
}
