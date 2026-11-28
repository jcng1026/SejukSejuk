import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUDIT_ACTIONS,
  AUDIT_VIA,
  AUDITED_TABLES,
  auditQuery,
  parseAuditFilters,
  type AuditFilters,
} from "@/features/audit/filters";
import { AUDIT_PAGE_SIZE, listAuditActors, listAuditEntries } from "@/features/audit/queries";
import { SELECT_CLASS } from "@/features/orders/FormField";
import { formatMytWhen } from "@/features/orders/schedule";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Audit log · Sejuk Sejuk Ops" };

const TABLE_LABEL: Record<string, string> = {
  orders: "Order",
  completions: "Completion",
  payments: "Payment",
  attachments: "File",
  flags: "Flag",
  profiles: "Person",
  whatsapp_messages: "WhatsApp message",
};
const ACTION_LABEL: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Changed",
  DELETE: "Deleted",
};
const VIA_LABEL: Record<string, string> = { ui: "App", ai: "AI assistant", system: "System" };

function Select({
  id,
  name,
  label,
  value,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value?: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} defaultValue={value ?? ""} className={SELECT_CLASS}>
        <option value="">Any</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

async function FilterForm({ filters }: { filters: AuditFilters }) {
  const actors = await listAuditActors();
  return (
    <form
      action="/audit"
      method="get"
      aria-label="Filter the audit log"
      className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Select
        id="audit-table"
        name="table"
        label="Record"
        value={filters.table}
        options={AUDITED_TABLES.map((table) => [table, TABLE_LABEL[table]] as const)}
      />
      <Select
        id="audit-action"
        name="action"
        label="Change"
        value={filters.action}
        options={AUDIT_ACTIONS.map((action) => [action, ACTION_LABEL[action]] as const)}
      />
      <Select
        id="audit-actor"
        name="actor"
        label="By"
        value={filters.actorId}
        options={actors.map((actor) => [actor.id, `${actor.name} (${actor.role})`] as const)}
      />
      <Select
        id="audit-via"
        name="via"
        label="Through"
        value={filters.via}
        options={AUDIT_VIA.map((via) => [via, VIA_LABEL[via]] as const)}
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="audit-order">Order number</Label>
        <Input
          id="audit-order"
          name="order"
          placeholder="ORD-261128-0001"
          defaultValue={filters.orderNo}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="audit-from">From</Label>
        <Input id="audit-from" name="from" type="date" defaultValue={filters.from} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="audit-to">To</Label>
        <Input id="audit-to" name="to" type="date" defaultValue={filters.to} />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" className="rounded-full">
          Filter
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/audit">Clear</Link>
        </Button>
      </div>
    </form>
  );
}

async function AuditTable({ filters }: { filters: AuditFilters }) {
  const { entries, total } = await listAuditEntries(filters);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-muted-foreground">No matching changes.</p>
    );
  }
  return (
    <section aria-labelledby="audit-results" className="flex flex-col gap-3">
      <h2 id="audit-results" className="text-sm text-muted-foreground">
        {total} change{total === 1 ? "" : "s"}, newest first · page {filters.page} of {pages}
      </h2>
      <div
        role="region"
        aria-label="Audit log table"
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border bg-card"
      >
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-normal">When</th>
              <th className="px-4 py-2 font-normal">Who</th>
              <th className="px-4 py-2 font-normal">What</th>
              <th className="px-4 py-2 font-normal">Order</th>
              <th className="px-4 py-2 font-normal">Fields</th>
              <th className="px-4 py-2 font-normal">Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t align-top">
                <td className="px-4 py-2 whitespace-nowrap">
                  <time dateTime={entry.at}>{formatMytWhen(entry.at)}</time>
                </td>
                <td className="px-4 py-2">
                  {entry.actorName}
                  {entry.via !== "ui" && (
                    <span className="block text-xs text-muted-foreground">
                      via {VIA_LABEL[entry.via] ?? entry.via}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {ACTION_LABEL[entry.action] ?? entry.action}{" "}
                  {TABLE_LABEL[entry.table] ?? entry.table}
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {entry.orderId && entry.orderNo ? (
                    <Link
                      href={`/orders/${entry.orderId}`}
                      className="text-primary hover:underline"
                    >
                      {entry.orderNo}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {entry.fields.join(", ") || "—"}
                </td>
                <td className="px-4 py-2">{entry.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pages" className="flex justify-between">
        {filters.page > 1 ? (
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/audit${auditQuery(filters, { page: filters.page - 1 })}`}>Newer</Link>
          </Button>
        ) : (
          <span />
        )}
        {filters.page < pages && (
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/audit${auditQuery(filters, { page: filters.page + 1 })}`}>Older</Link>
          </Button>
        )}
      </nav>
    </section>
  );
}

async function Audit({ searchParams }: { searchParams: PageProps<"/audit">["searchParams"] }) {
  await requireUser(["admin", "manager"]);
  const filters = parseAuditFilters(await searchParams);
  return (
    <>
      <FilterForm filters={filters} />
      <AuditTable filters={filters} />
    </>
  );
}

export default function AuditPage({ searchParams }: PageProps<"/audit">) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl">Audit log</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading the audit log…</p>}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
