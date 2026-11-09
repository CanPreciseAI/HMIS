import { useEffect, useState } from "react";
import { Loader2, Printer, Receipt } from "lucide-react";
import {
  formatDate,
  loadFacilityInvoices,
  loadInvoiceBalances,
  money,
  type InvoiceBalance,
  type InvoiceRow,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

/**
 * Reception's printable invoice view. It uses the invoice's stored line items
 * and amounts, so the printed subtotal, discount, tax and total match the
 * patient's bill exactly.
 */
export function ReceptionInvoicePanel({ ctx }: { ctx: StaffContext }) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [balances, setBalances] = useState<Record<string, InvoiceBalance>>({});
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.all([
      loadFacilityInvoices(ctx),
      loadInvoiceBalances(ctx).catch(() => [] as InvoiceBalance[]),
    ])
      .then(([invoiceRows, balanceRows]) => {
        if (cancelled) return;
        setInvoices(invoiceRows);
        setBalances(
          Object.fromEntries(balanceRows.map((row) => [row.invoiceId, row])),
        );
        setSelectedId((current) =>
          invoiceRows.some((row) => row.id === current)
            ? current
            : (invoiceRows[0]?.id ?? ""),
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load invoices for printing.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  const selected =
    invoices.find((invoice) => invoice.id === selectedId) ?? null;
  const balance = selected ? balances[selected.id] : undefined;

  return (
    <Panel
      title="Patient invoices"
      subtitle="Review the services and items assigned to a patient, then print the invoice with its subtotal and total."
      action={
        selected ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 print:hidden"
          >
            <Printer className="size-4" /> Print invoice
          </button>
        ) : null
      }
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading invoices…
        </p>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices to print"
          description="Issued patient invoices will appear here with their itemised services and totals."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
            <label className="w-full max-w-md text-xs font-medium text-muted-foreground">
              Invoice to print
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.currentTarget.value)}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} · {invoice.patient} ·{" "}
                    {money(invoice.amount)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected && (
            <article
              id="invoice-print-area"
              className="rounded-xl border border-border bg-white p-5 text-foreground sm:p-7 print:rounded-none print:border-0 print:p-0"
            >
              <header className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start">
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">
                    {ctx.facilityName ?? ctx.tenantName ?? "Hospital"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Patient invoice
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-display text-base font-semibold tracking-wide text-foreground">
                    INVOICE
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {selected.number}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected.issuedAt
                      ? `Issued ${formatDate(selected.issuedAt)}`
                      : "Not issued"}
                  </p>
                </div>
              </header>

              <div className="flex flex-col justify-between gap-4 py-4 sm:flex-row">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Billed to
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {selected.patient}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <div className="mt-1">
                    <StatusPill status={selected.status} />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-y border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">
                        Service / item
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        Qty
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        Unit price
                      </th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selected.items.length ? (
                      selected.items.map((item, index) => (
                        <tr key={`${selected.id}-${index}`}>
                          <td className="py-2.5 pr-3 text-foreground">
                            {item.description}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-foreground">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-foreground">
                            {money(item.unitPrice)}
                          </td>
                          <td className="py-2.5 text-right font-medium text-foreground">
                            {money(item.lineTotal)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-3 text-sm text-muted-foreground"
                        >
                          No itemised services recorded on this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex justify-end">
                <dl className="w-full space-y-1.5 text-sm sm:w-72">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="font-medium text-foreground">
                      {money(selected.grossAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd className="font-medium text-foreground">
                      − {money(selected.discountAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Tax</dt>
                    <dd className="font-medium text-foreground">
                      + {money(selected.taxAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold text-foreground">
                    <dt>Total</dt>
                    <dd>{money(selected.amount)}</dd>
                  </div>
                  {balance && (
                    <>
                      <div className="flex justify-between gap-4 pt-1">
                        <dt className="text-muted-foreground">Paid</dt>
                        <dd className="font-medium text-foreground">
                          {money(balance.paidAmount)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold text-foreground">
                        <dt>Balance due</dt>
                        <dd>{money(balance.outstanding)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              <p className="mt-6 border-t border-border pt-3 text-[11px] text-muted-foreground">
                Amounts reflect the services and items recorded for this
                patient. Please keep this invoice for your records.
              </p>
            </article>
          )}
        </>
      )}
    </Panel>
  );
}
