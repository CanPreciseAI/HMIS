import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it.each(["/", "/auth", "/patient-auth", "/patient", "/staff-pending"])(
    "matches a page for %s instead of falling back to not found",
    (path) => {
      const router = createRouter({
        routeTree,
        context: { queryClient: new QueryClient() },
      });

      const matches = router.matchRoutes(path);

      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    },
  );

  it.each([
    "patient-flow",
    "ward-capacity",
    "departments",
    "medicine-catalog",
    "billing",
    "staff-approvals",
    "hospital-admin-approvals",
    "hospital-records",
    "staff-records",
    "today-schedule",
    "your-patients",
    "results-to-review",
    "recent-notes",
    "care-queue",
    "handoff-notes",
    "sample-queue",
    "lab-results",
    "prescription-queue",
    "dispensing-history",
    "pharmacy-stock",
    "reception-schedule",
    "patient-register",
    "patient-approvals",
    "insurance-policies",
    "insurance-claims",
    "reception-billing",
    "invoices",
  ])("matches the in-dashboard detail route for %s", (section) => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    const matches = router.matchRoutes(`/dashboard/${section}`);

    expect(matches.at(-1)?.routeId).toBe("/_authenticated/dashboard/$section");
    expect(
      (matches.at(-1)?.params as { section?: string } | undefined)?.section,
    ).toBe(section);
  });
});
