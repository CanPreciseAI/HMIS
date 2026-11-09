import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const [roleResult, employmentResult] = await Promise.all([
      supabase
        .from("user_roles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("my_employment"),
    ]);

    if (roleResult.error) throw roleResult.error;
    if (employmentResult.error) throw employmentResult.error;

    const isHospitalAdmin = employmentResult.data?.some((employment) =>
      employment.role_names?.includes("hospital_admin"),
    );
    if (!roleResult.data && !isHospitalAdmin) {
      throw redirect({ to: "/patient-auth" });
    }
  },
  component: () => <Outlet />,
});
