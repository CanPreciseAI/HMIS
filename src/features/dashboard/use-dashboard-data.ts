import { useEffect, useState } from "react";
import type { StaffContext } from "./data";

/**
 * Loads a role's dashboard payload once per signed-in user and exposes
 * loading/error state to the active workspace.
 */
export function useDashboardData<T>(
  ctx: StaffContext,
  load: (ctx: StaffContext) => Promise<T>,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    load(ctx)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load this workspace",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ctx, load]);

  // Re-read the tables when the tab becomes active again, so the workspace shows
  // the rows that were written while it was in the background.
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") return;
      void load(ctx)
        .then((result) => {
          setData(result);
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not refresh this workspace",
          );
        });
    }

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [ctx, load]);

  return { data, loading, error };
}
