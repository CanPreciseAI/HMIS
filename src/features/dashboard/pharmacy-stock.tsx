import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LOW_STOCK_THRESHOLD, type PharmacistData } from "./data";
import { EmptyState, Panel } from "./ui";

type StockRow = PharmacistData["medicineStock"][number];

function projected(row: StockRow) {
  return row.available - row.prescribed;
}

function isShortage(row: StockRow) {
  return !row.isMapped || projected(row) <= LOW_STOCK_THRESHOLD;
}

function badge(row: StockRow) {
  if (!row.isMapped) {
    return {
      label: "Not linked",
      className: "bg-muted text-muted-foreground ring-border",
    };
  }
  if (projected(row) <= 0) {
    return {
      label: "Out of stock",
      className: "bg-rose-50 text-rose-700 ring-rose-200",
    };
  }
  if (isShortage(row)) {
    return {
      label: "Low stock",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }
  return {
    label: "In stock",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
}

/**
 * Catalog medicines with their stock position. The list opens on shortages
 * only, and the search narrows it by medicine name or strength.
 */
export function PharmacyStockPanel({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");
  const [shortagesOnly, setShortagesOnly] = useState(true);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (shortagesOnly && !isShortage(row)) return false;
        if (!needle) return true;
        return `${row.name} ${row.strength}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => projected(a) - projected(b));
  }, [rows, query, shortagesOnly]);

  const shortageCount = rows.filter(isShortage).length;

  return (
    <Panel
      title="Medicine stock"
      subtitle={`${filtered.length} of ${rows.length} medicines shown · ${shortageCount} at or below ${LOW_STOCK_THRESHOLD} projected`}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search medicine or strength"
            aria-label="Search medicine stock"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={shortagesOnly}
            onChange={(event) => setShortagesOnly(event.currentTarget.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          Only shortages
        </label>
      </div>

      {filtered.length ? (
        <ul className="divide-y divide-border">
          {filtered.map((row) => {
            const state = badge(row);
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {row.name} {row.strength}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.isMapped
                      ? `${row.available} available`
                      : "Stock not linked"}
                    {row.prescribed > 0
                      ? ` · ${row.prescribed} prescribed`
                      : ""}
                    {" · "}
                    {projected(row)} projected
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${state.className}`}
                >
                  {state.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Search}
          title={
            rows.length
              ? "No matching medicines"
              : "No medicines in the catalog"
          }
          description={
            rows.length
              ? "Try a different search, or untick “Only shortages” to see the full catalog."
              : "Medicines added by your hospital administrator will appear here with their available stock."
          }
        />
      )}
    </Panel>
  );
}
