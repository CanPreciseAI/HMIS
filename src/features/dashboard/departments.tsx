import { useEffect, useState, type FormEvent } from "react";
import { Building2, Plus, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { DepartmentStaffRow, StaffContext } from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

type DepartmentOption = { id: string; name: string; staff: number };

/**
 * Department staffing for the hospital administrator. Staff are grouped by the
 * department they registered with; availability is set by each staff member in
 * their own dashboard and is shown here read-only. The administrator can add
 * departments and remove empty ones.
 */
export function DepartmentStaffManagement({
  ctx,
  departments,
  staff,
}: {
  ctx: StaffContext;
  departments: DepartmentOption[];
  staff: DepartmentStaffRow[];
}) {
  const [rows, setRows] = useState(departments);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setRows(departments);
  }, [departments]);

  const canManage = ctx.role === "hospital_admin" && Boolean(ctx.facilityId);

  async function addDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a department name.");
      return;
    }
    if (!ctx.facilityId) {
      setError("Your workspace is missing its facility.");
      return;
    }

    setSaving(true);
    setError("");
    const { data: id, error: requestError } = await supabase.rpc(
      "ensure_department",
      { _facility_id: ctx.facilityId, _name: trimmed },
    );
    setSaving(false);
    if (requestError || !id) {
      setError(
        requestError
          ? `Could not add the department: ${requestError.message}`
          : "The department could not be created.",
      );
      return;
    }

    setRows((current) => {
      if (current.some((row) => row.id === id)) return current;
      return [...current, { id, name: trimmed, staff: 0 }].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    });
    setName("");
    setFormOpen(false);
    toast.success(`${trimmed} department added`);
  }

  async function removeDepartment(department: DepartmentOption) {
    if (!ctx.tenantId) return;
    const members = staff.filter(
      (row) => row.departmentId === department.id,
    ).length;
    if (members > 0) {
      toast.error(
        `Move the ${members} staff member${members === 1 ? "" : "s"} in ${department.name} to another department first.`,
      );
      return;
    }

    setRemovingId(department.id);
    const { error: requestError } = await supabase
      .from("departments")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("id", department.id);
    setRemovingId(null);
    if (requestError) {
      toast.error(
        `Could not remove ${department.name}: ${requestError.message}`,
      );
      return;
    }
    setRows((current) => current.filter((row) => row.id !== department.id));
    toast.success(`${department.name} removed`);
  }

  const departmentIds = new Set(rows.map((dept) => dept.id));
  const query = search.trim().toLowerCase();
  const matchesSearch = (row: DepartmentStaffRow) =>
    !query ||
    (row.name ?? "").toLowerCase().includes(query) ||
    row.employeeCode.toLowerCase().includes(query) ||
    (row.email ?? "").toLowerCase().includes(query);
  const visibleStaff = staff.filter(matchesSearch);
  const unassigned = staff.filter(
    (row) => !row.departmentId || !departmentIds.has(row.departmentId),
  );
  const visibleUnassigned = unassigned.filter(matchesSearch);
  const knownStaff = new Set(staff.map((row) => row.departmentId));
  const visibleDepartments = rows.filter(
    (dept) =>
      !query ||
      staff.some((row) => row.departmentId === dept.id && matchesSearch(row)),
  );
  const noMatches =
    Boolean(query) &&
    visibleStaff.length === 0 &&
    visibleDepartments.length === 0;

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Departments
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Add a department here, or remove one that no longer has staff.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen((current) => !current)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <Plus className="size-4" />{" "}
              {formOpen ? "Hide form" : "Add department"}
            </button>
          </div>

          {formOpen && (
            <form
              onSubmit={(event) => void addDepartment(event)}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <label className="min-w-0 flex-1 text-xs font-medium text-foreground">
                Department name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="e.g. Paediatrics"
                  disabled={saving}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm font-normal text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                >
                  <Plus className="size-4" /> {saving ? "Saving…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setError("");
                  }}
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                >
                  <X className="size-4" /> Cancel
                </button>
              </div>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <Panel
          title="Department staffing"
          subtitle="Staff grouped by the department they registered with"
        >
          <EmptyState
            icon={Building2}
            title="No departments yet"
            description="Add a department above so staff can be grouped by it."
          />
        </Panel>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="sr-only">Search staff by name</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search staff by name, code or email"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear staff search"
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          {query && (
            <p className="text-xs text-muted-foreground">
              {visibleStaff.length} of {staff.length} staff match
            </p>
          )}
        </div>
      )}

      {noMatches && (
        <Panel
          title="No matching staff"
          subtitle={`Nothing matches “${search.trim()}” in this facility`}
        >
          <EmptyState
            icon={Users}
            title="No staff found"
            description="Try another name, employee code or email address."
          />
        </Panel>
      )}

      {visibleDepartments.map((dept) => {
        const allMembers = staff.filter((row) => row.departmentId === dept.id);
        const members = allMembers.filter(matchesSearch);
        const available = members.filter(
          (row) => row.availability === "available",
        ).length;
        return (
          <Panel
            key={dept.id}
            title={dept.name}
            subtitle={`${members.length} staff · ${available} available`}
            {...(canManage
              ? {
                  action: (
                    <button
                      type="button"
                      disabled={
                        removingId !== null ||
                        allMembers.length > 0 ||
                        knownStaff.has(dept.id)
                      }
                      title={
                        allMembers.length > 0
                          ? "Move staff out of this department before removing it"
                          : undefined
                      }
                      onClick={() => void removeDepartment(dept)}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  ),
                }
              : {})}
          >
            {members.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No staff assigned"
                description="Staff who registered with this department will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {members.map((row) => (
                  <li
                    key={row.employeeId}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {row.name ?? row.employeeCode}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {row.name ? `${row.employeeCode} · ` : ""}
                        {row.email ?? "No registered email"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {row.roles.length
                          ? `Role: ${row.roles.join(", ")}`
                          : "No active role"}
                        {row.designationName ? ` · ${row.designationName}` : ""}
                        {` · Employment: ${row.employmentStatus.replaceAll("_", " ")}`}
                      </p>
                    </div>
                    <StatusPill status={row.availability} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}

      {visibleUnassigned.length > 0 && (
        <Panel
          title="Unassigned staff"
          subtitle="Employees without a department in this facility"
        >
          <ul className="divide-y divide-border">
            {visibleUnassigned.map((row) => (
              <li
                key={row.employeeId}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {row.name ?? row.employeeCode}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.email ?? "No registered email"}
                  </p>
                </div>
                <StatusPill status={row.availability} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
