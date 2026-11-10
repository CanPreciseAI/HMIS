import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { humanise } from "./data";

const TONES = {
  teal: "bg-secondary text-primary",
  amber: "bg-amber-100 text-amber-800",
  violet: "bg-violet-100 text-violet-700",
  blue: "bg-sky-100 text-sky-700",
} as const;

export function Panel({
  id,
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_oklch(0.26_0.03_200_/_0.05)] sm:p-6 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "teal",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_oklch(0.26_0.03_200_/_0.05)] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={`grid size-8 place-items-center rounded-xl ${TONES[tone]}`}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  scheduled: "bg-sky-50 text-sky-700 ring-sky-200",
  consultation: "bg-sky-50 text-sky-700 ring-sky-200",
  surgery: "bg-rose-50 text-rose-700 ring-rose-200",
  procedure: "bg-violet-50 text-violet-700 ring-violet-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  expired: "bg-muted text-muted-foreground ring-border",
  submitted: "bg-amber-50 text-amber-700 ring-amber-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  partial: "bg-sky-50 text-sky-700 ring-sky-200",
  dispensed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  open: "bg-secondary text-primary ring-primary/20",
  ordered: "bg-sky-50 text-sky-700 ring-sky-200",
  preliminary: "bg-amber-50 text-amber-700 ring-amber-200",
  checked_in: "bg-amber-50 text-amber-700 ring-amber-200",
  checked: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  urgent: "bg-rose-50 text-rose-700 ring-rose-200",
  draft: "bg-muted text-muted-foreground ring-border",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  signed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sent: "bg-sky-50 text-sky-700 ring-sky-200",
  received: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  no_show: "bg-rose-50 text-rose-700 ring-rose-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  discharged: "bg-muted text-muted-foreground ring-border",
  available: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  busy: "bg-amber-50 text-amber-700 ring-amber-200",
  on_leave: "bg-sky-50 text-sky-700 ring-sky-200",
  off_duty: "bg-muted text-muted-foreground ring-border",
};

export function StatusPill({ status }: { status: string }) {
  const tone =
    STATUS_TONES[status] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}
    >
      {humanise(status)}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function WardMeter({
  ward,
  total,
  occupied,
}: {
  ward: string;
  total: number;
  occupied: number;
}) {
  const pct = total ? Math.round((occupied / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{ward}</span>
        <span className="text-xs text-muted-foreground">
          {occupied}/{total} beds
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Avatar({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      className={`grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground ${className}`}
    >
      {initials}
    </span>
  );
}

export function FlowChart({
  data,
}: {
  data: { day: string; admissions: number; discharges: number }[];
}) {
  const peak = Math.max(
    4,
    ...data.map((d) => Math.max(d.admissions, d.discharges)),
  );

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> Admissions
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" /> Discharges
        </span>
      </div>
      <div className="mt-4 flex h-36 items-end gap-3">
        {data.map((point) => (
          <div
            key={point.day}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <div className="flex h-28 w-full items-end justify-center gap-1">
              <div
                className="w-1/2 max-w-6 rounded-t-md bg-primary/85"
                style={{
                  height: `${Math.max((point.admissions / peak) * 100, 2)}%`,
                }}
                title={`${point.admissions} admissions`}
              />
              <div
                className="w-1/2 max-w-6 rounded-t-md bg-accent"
                style={{
                  height: `${Math.max((point.discharges / peak) * 100, 2)}%`,
                }}
                title={`${point.discharges} discharges`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {point.day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LinkRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span className="shrink-0 text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

export function PanelLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
    >
      {label} <ArrowUpRight className="size-3.5" />
    </a>
  );
}
