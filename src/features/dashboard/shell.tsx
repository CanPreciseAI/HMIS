import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Bell, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/canprecise-logo.png";
import { ROLE_LABELS, type AdminNotification, type StaffContext } from "./data";
import { Avatar } from "./ui";

export type NavItem = { label: string; href: string; icon: LucideIcon };

function DashboardLink({
  href,
  className,
  children,
  ...props
}: {
  href: string;
  className: string;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
  onClick?: () => void;
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isActive = pathname === href;
  const linkClassName = `${className} ${
    isActive ? "bg-secondary font-semibold text-primary shadow-sm" : ""
  }`;

  if (href === "/dashboard") {
    return (
      <Link
        to="/dashboard"
        className={linkClassName}
        aria-current={isActive ? "page" : undefined}
        {...props}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      to="/dashboard/$section"
      params={{ section: href.slice("/dashboard/".length) }}
      className={linkClassName}
      aria-current={isActive ? "page" : undefined}
      {...props}
    >
      {children}
    </Link>
  );
}

export function DashboardShell({
  ctx,
  nav,
  children,
  notificationCount,
  notificationHref,
  notifications,
}: {
  ctx: StaffContext;
  nav: NavItem[];
  children: ReactNode;
  notificationCount?: number;
  notificationHref?: string;
  notifications?: AdminNotification[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [availability, setAvailability] = useState(
    ctx.availability ?? "available",
  );
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function updateAvailability(next: string) {
    if (!ctx.employeeId) return;
    setAvailabilitySaving(true);
    const { error } = await supabase.rpc("set_my_availability", {
      _availability: next,
    });
    setAvailabilitySaving(false);
    if (error) {
      toast.error(`Could not update availability: ${error.message}`);
      return;
    }
    setAvailability(next);
    toast.success("Availability updated");
  }

  const workspace = ROLE_LABELS[ctx.role] ?? "Staff";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="min-h-screen bg-[oklch(0.975_0.01_185)]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="flex items-center justify-center px-5 py-4">
            <img
              src={logo}
              alt="CanPreciseAI"
              width={154}
              height={83}
              className="h-10 w-auto shrink-0 object-contain"
            />
          </div>

          <div className="mx-4 rounded-xl bg-secondary/70 px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Workspace
            </p>
            <p className="mt-1 text-sm font-semibold text-secondary-foreground">
              {workspace}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {ctx.facilityName ?? "Main facility"}
              {ctx.departmentName ? ` Â· ${ctx.departmentName}` : ""}
            </p>
          </div>

          <nav className="mt-5 flex-1 space-y-0.5 px-3">
            {nav.map((item) => (
              <DashboardLink
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <item.icon className="size-4" />
                {item.label}
              </DashboardLink>
            ))}
          </nav>

          <div className="m-3 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={ctx.fullName} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {ctx.fullName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {ctx.employeeCode ?? ctx.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-input text-xs font-medium text-foreground transition hover:bg-accent"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2.5">
                <img
                  src={logo}
                  alt="CanPreciseAI"
                  width={154}
                  height={83}
                  className="h-9 w-auto shrink-0 lg:hidden"
                />
                <div>
                  <p className="font-display text-sm font-semibold leading-none text-foreground">
                    {workspace} workspace
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {ctx.facilityName ?? ctx.tenantName ?? "CanPreciseAI"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {notificationHref !== undefined && (
                  <DashboardLink
                    href={notificationHref}
                    aria-label={`${notificationCount ?? 0} pending staff approvals`}
                    title="Pending staff approvals"
                    className="relative grid size-8 place-items-center rounded-lg border border-input text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    <Bell className="size-4" />
                    {(notificationCount ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                        {(notificationCount ?? 0) > 99
                          ? "99+"
                          : notificationCount}
                      </span>
                    )}
                  </DashboardLink>
                )}
                <span className="hidden items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                  <ShieldCheck className="size-3.5 text-primary" /> {today}
                </span>
                {ctx.employeeId && (
                  <label
                    title="Your availability"
                    className="hidden items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex"
                  >
                    <span className="sr-only">Your availability</span>
                    <select
                      value={availability}
                      onChange={(event) =>
                        void updateAvailability(event.currentTarget.value)
                      }
                      disabled={availabilitySaving}
                      className="bg-transparent text-[11px] font-medium text-foreground outline-none disabled:opacity-60"
                    >
                      {["available", "busy", "on_leave", "off_duty"].map(
                        (option) => (
                          <option key={option} value={option}>
                            {option.charAt(0).toUpperCase() +
                              option.slice(1).replaceAll("_", " ")}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                )}
                <Avatar name={ctx.fullName} />
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                  className="grid size-8 place-items-center rounded-lg border border-input text-muted-foreground transition hover:bg-accent hover:text-foreground lg:hidden"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              {notifications && notifications.length > 0 && (
                <section
                  aria-labelledby="dashboard-notifications-title"
                  className="mb-5 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      id="dashboard-notifications-title"
                      className="text-sm font-semibold text-foreground"
                    >
                      Notifications
                    </h2>
                    <span className="text-[11px] text-muted-foreground">
                      {notifications.length} active
                    </span>
                  </div>
                  <ul className="mt-2 divide-y divide-border">
                    {notifications.map((item) => (
                      <li key={item.id}>
                        <DashboardLink
                          href={item.href}
                          className="flex w-full items-start gap-2.5 py-2.5 transition hover:bg-accent"
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-1 size-2 shrink-0 rounded-full ${
                              item.tone === "danger"
                                ? "bg-destructive"
                                : item.tone === "warning"
                                  ? "bg-amber-500"
                                  : "bg-primary"
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-foreground">
                              {item.title}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                              {item.description}
                            </span>
                          </span>
                        </DashboardLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
  meta,
  action,
}: {
  title: string;
  subtitle: string;
  meta?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[26px]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {(meta || action) && (
        <div className="flex flex-wrap items-center gap-2">
          {meta && (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {meta}
            </span>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
