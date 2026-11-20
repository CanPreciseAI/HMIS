import { createFileRoute } from "@tanstack/react-router";
import { HeroPage } from "@/features/hero/hero-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CanPreciseAI — Precision hospital operations" },
      {
        name: "description",
        content:
          "A calm, connected command centre for hospital teams — clinical, ward, laboratory, pharmacy and billing workflows in one precise view.",
      },
      {
        property: "og:title",
        content: "CanPreciseAI — Precision hospital operations",
      },
      {
        property: "og:description",
        content:
          "Every patient, every handoff, in perfect focus. Secure staff and patient portals for CanPreciseAI.",
      },
      { property: "og:type", content: "website" },
      { property: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HeroPage,
});
