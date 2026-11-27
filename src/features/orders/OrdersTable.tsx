import Link from "next/link";

import { Button } from "@/components/ui/button";

import { FlagChip, StatusBadge } from "./badges";
import { filtersToQuery } from "./filters";
import { ORDER_STATUSES, STATUS_LABEL, topOpenSeverity } from "./labels";
import { formatSen } from "./money";
import { listOrders, listTechnicians, PAGE_SIZE, type OrderFilters } from "./queries";
import { formatMytWhen } from "./schedule";
import { SELECT_CLASS } from "./FormField";

export async function OrdersTable({ filters }: { filters: OrderFilters }) {
  const [{ rows, total }, technicians] = await Promise.all([
    listOrders(filters),
    listTechnicians(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4"
        role="search"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Search</span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Order no, name or phone"
            className={`${SELECT_CLASS} w-64`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={filters.status ?? ""} className={SELECT_CLASS}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Technician</span>
          <select
            name="technician"
            defaultValue={filters.technicianId ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">Anyone</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.fullName}
                {tech.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">From</span>
          <input type="date" name="from" defaultValue={filters.from} className={SELECT_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">To</span>
          <input type="date" name="to" defaultValue={filters.to} className={SELECT_CLASS} />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="flagged"
            value="1"
            defaultChecked={filters.flagged}
            className="size-4 accent-primary"
          />
          Open flags only
        </label>
        <Button type="submit" className="rounded-full">
          Apply
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/orders">Clear</Link>
        </Button>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total} {total === 1 ? "order" : "orders"}
      </p>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Scheduled</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Technician</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Flag</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const severity = topOpenSeverity(row.flags);
              return (
                <tr key={row.id} className="border-b last:border-0 hover:bg-background">
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    <Link
                      href={`/orders/${row.id}`}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {row.orderNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatMytWhen(row.scheduledAt)}</td>
                  <td className="px-4 py-3">{row.customerName}</td>
                  <td className="px-4 py-3">{row.serviceType}</td>
                  <td className="px-4 py-3">
                    {row.technicianName ?? (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {severity ? <FlagChip severity={severity} /> : null}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatSen(row.finalSen ?? row.quotedSen)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {filters.page} of {pages}
        </span>
        <div className="flex gap-2">
          {filters.page > 1 && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/orders${filtersToQuery(filters, { page: filters.page - 1 })}`}>
                Previous
              </Link>
            </Button>
          )}
          {filters.page < pages && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/orders${filtersToQuery(filters, { page: filters.page + 1 })}`}>
                Next
              </Link>
            </Button>
          )}
        </div>
      </nav>
    </div>
  );
}
