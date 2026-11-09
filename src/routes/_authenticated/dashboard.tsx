import { useEffect, useState } from "react";
import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AdminDashboard } from "@/features/dashboard/admin";
import { DoctorDashboard } from "@/features/dashboard/doctor";
import { loadStaffContext, type StaffContext } from "@/features/dashboard/data";
import { NurseDashboard } from "@/features/dashboard/nurse";
import { PlatformAdminDashboard } from "@/features/dashboard/platform-admin";
import { OperationalStaffDashboard } from "@/features/dashboard/operational-staff";
import { InsuranceWorkspace } from "@/features/dashboard/insurance";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CanPreciseAI" },
      {
        name: "description",
        content: "Your CanPreciseAI staff workspace.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [ctx, setCtx] = useState<StaffContext | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (pathname !== "/dashboard") return;

    let cancelled = false;
    loadStaffContext()
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setFailed(true);
          return;
        }
        setCtx(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (pathname !== "/dashboard") {
    return <Outlet />;
  }

  if (failed) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <p className="text-sm text-muted-foreground">
          We could not load your workspace. Please refresh or sign in again.
        </p>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  switch (ctx.role) {
    case "admin":
      return <PlatformAdminDashboard ctx={ctx} />;
    case "hospital_admin":
      return <AdminDashboard ctx={ctx} />;
    case "nurse":
      return <NurseDashboard ctx={ctx} />;
    case "doctor":
      return <DoctorDashboard ctx={ctx} />;
    case "insurance":
      return <InsuranceWorkspace ctx={ctx} />;
    default:
      return <OperationalStaffDashboard ctx={ctx} />;
  }
}
