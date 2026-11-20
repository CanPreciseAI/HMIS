import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { StaffContext } from "./data";

type HistoryEvent = {
  event_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_name: string;
  actor_role: string | null;
  detail: unknown;
  occurred_at: string;
  tenant_name: string | null;
};

const ENTITY_LABELS: Record<string, string> = {
  patients: "patient record",
  encounters: "visit",
  appointments: "appointment",
  clinical_notes: "clinical note",
  admissions: "admission",
  allergies: "allergy",
  diagnoses: "diagnosis",
  observations: "observation",
  lab_orders: "lab order",
  lab_order_items: "lab test",
  lab_results: "lab result",
  radiology_orders: "imaging order",
  prescriptions: "prescription",
  prescription_items: "prescription line",
  prescription_dispenses: "dispense",
  beds: "bed",
  bed_assignments: "bed assignment",
  wards: "ward",
  employees: "staff record",
  staff_approval_requests: "staff approval",
  invoices: "invoice",
  invoice_items: "invoice line",
  payments: "payment",
  payment_allocations: "payment allocation",
  charge_catalog: "service charge",
  lab_test_catalog: "lab test price",
  medicine_catalog: "medicine",
  medicine_requests: "medicine request",
  medicine_vendor_orders: "vendor order",
  inventory_items: "stock item",
  stock_batches: "stock batch",
  insurance_policies: "insurance policy",
  insurance_policy_claims: "insurance claim",
  vendors: "vendor",
  assets: "asset",
  purchase_requisitions: "purchase requisition",
};

const ACTION_LABELS: Record<string, string> = {
  insert: "added",
  update: "updated",
  delete: "removed",
};

/** Which records belong to which dashboard section. `null` shows everything. */
const SECTION_ENTITIES: Record<string, string[] | null> = {
  "patient-flow": ["patients", "encounters", "admissions", "appointments"],
  "ward-capacity": ["beds", "bed_assignments", "wards", "admissions"],
  departments: ["employees", "staff_approval_requests"],
  "medicine-catalog": ["medicine_catalog", "inventory_items", "stock_batches"],
  billing: [
    "invoices",
    "invoice_items",
    "payments",
    "payment_allocations",
    "charge_catalog",
  ],
  "staff-approvals": ["staff_approval_requests", "employees"],
  "hospital-admin-approvals": ["staff_approval_requests", "employees"],
  "hospital-records": ["employees", "staff_approval_requests"],
  "staff-records": ["employees", "staff_approval_requests"],
  "doctor-appointments": ["appointments"],
  "today-schedule": ["appointments"],
  "reception-schedule": ["appointments"],
  "your-patients": ["encounters", "clinical_notes", "admissions"],
  "lab-assignments": ["lab_orders", "lab_order_items", "lab_results"],
  "results-to-review": ["lab_results", "lab_order_items"],
  "sample-queue": ["lab_orders", "lab_order_items", "lab_results"],
  "lab-results": ["lab_results", "lab_order_items", "lab_orders"],
  "recent-notes": ["clinical_notes"],
  "handoff-notes": ["clinical_notes"],
  "write-prescription": [
    "prescriptions",
    "prescription_items",
    "prescription_dispenses",
    "medicine_catalog",
  ],
  "prescription-history": [
    "prescriptions",
    "prescription_items",
    "prescription_dispenses",
  ],
  "prescription-queue": [
    "prescriptions",
    "prescription_items",
    "prescription_dispenses",
    "medicine_requests",
  ],
  "dispensing-history": [
    "prescription_dispenses",
    "prescription_items",
    "prescriptions",
  ],
  "pharmacy-stock": [
    "inventory_items",
    "stock_batches",
    "medicine_catalog",
    "medicine_requests",
    "medicine_vendor_orders",
  ],
  "care-queue": [
    "encounters",
    "admissions",
    "lab_orders",
    "lab_order_items",
    "clinical_notes",
  ],
  "patient-register": ["patients", "appointments", "admissions", "encounters"],
  "patient-approvals": ["patients", "admissions", "encounters"],
  "insurance-policies": ["insurance_policies", "invoices"],
  "insurance-claims": ["insurance_policy_claims", "invoices"],
  "service-charges": [
    "invoices",
    "invoice_items",
    "payments",
    "payment_allocations",
    "charge_catalog",
    "lab_orders",
  ],
  "reception-billing": [
    "invoices",
    "invoice_items",
    "payments",
    "payment_allocations",
    "charge_catalog",
  ],
  invoices: [
    "invoices",
    "invoice_items",
    "payments",
    "payment_allocations",
    "charge_catalog",
  ],
};

const RECORD_KEYS = [
  "invoice_number",
  "payment_reference",
  "patient_number",
  "employee_code",
  "accession_number",
  "claim_number",
  "medicine_code",
  "test_code",
  "charge_code",
  "bed_code",
  "ward",
  "name",
  "vendor_code",
  "batch_number",
  "policy_number",
];

function recordReference(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const row = (detail as { row?: unknown }).row;
  if (!row || typeof row !== "object") return null;
  for (const key of RECORD_KEYS) {
    const value = (row as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(Math.round((Date.now() - then) / 1000), 0);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function sectionName(pathname: string): string {
  if (!pathname.startsWith("/dashboard/")) return "Overview";
  const raw = pathname.slice("/dashboard/".length);
  return raw
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * "Section history": every recorded action in the part of the workspace the
 * actor is currently viewing. Rows come from the audit trail, which records
 * inserts, updates and deletes for all actors in the hospital.
 */
export function ActionHistory({ ctx }: { ctx: StaffContext }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const sectionKey = pathname.startsWith("/dashboard/")
    ? pathname.slice("/dashboard/".length)
    : "overview";
  const entityFilter = SECTION_ENTITIES[sectionKey] ?? null;

  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.rpc("action_history", {
      _facility_id: ctx.facilityId,
      _limit: 100,
      _actor_id: ctx.userId,
    });
    if (queryError) {
      setError(queryError.message);
      setEvents([]);
    } else {
      setEvents((data ?? []) as HistoryEvent[]);
    }
    setLoading(false);
  }, [ctx.facilityId, ctx.userId]);

  useEffect(() => {
    void load();
  }, [load, sectionKey]);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") void load();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    // Keep the history current while the actor works, without a reload.
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [load]);

  const isOverview = entityFilter === null;
  const sectionEvents = isOverview
    ? events
    : events.filter((event) => entityFilter.includes(event.entity_type));
  // Both the overview digest and a section history stay short: only this
  // actor's five most recent actions, already filtered by the database.
  const visible = sectionEvents.slice(0, 5);

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-secondary text-primary">
            <History className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {isOverview ? "Recent activity" : "Section history"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {isOverview
                ? "Your five most recent actions in this hospital"
                : `${sectionName(pathname)} · your five most recent actions`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-3" aria-hidden="true" />
          )}
          Refresh
        </button>
      </header>

      {error ? (
        <p className="px-4 py-5 text-xs text-destructive">{error}</p>
      ) : loading && !events.length ? (
        <p className="flex items-center gap-2 px-4 py-5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Reading the action history…
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-5 text-xs text-muted-foreground">
          {isOverview
            ? "You have not recorded any actions yet. Every create, update and delete you make will appear here automatically."
            : "You have not recorded any actions in this section yet. Every create, update and delete you make here will appear automatically."}
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {visible.map((event) => {
            const entity =
              ENTITY_LABELS[event.entity_type] ?? event.entity_type;
            const verb = ACTION_LABELS[event.action] ?? event.action;
            const reference = recordReference(event.detail);
            return (
              <li
                key={event.event_id}
                className="flex items-start gap-2.5 px-4 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-foreground">
                    <span className="font-semibold">{event.actor_name}</span>{" "}
                    {verb} {entity}
                    {reference ? (
                      <span className="font-medium"> {reference}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <time
                      dateTime={event.occurred_at}
                      title={new Date(event.occurred_at).toLocaleString()}
                    >
                      {relativeTime(event.occurred_at)}
                    </time>
                    {event.tenant_name ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{event.tenant_name}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
