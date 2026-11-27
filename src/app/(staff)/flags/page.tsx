import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ResolveFlagButton } from "@/features/flags/FlagActions";
import { listOpenFlags } from "@/features/flags/queries";
import { FlagChip } from "@/features/orders/badges";
import { formatMytWhen } from "@/features/orders/schedule";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Flags · Sejuk Sejuk Ops" };

async function OpenFlags() {
  await requireUser(["admin", "manager"]);
  const flags = await listOpenFlags();
  if (flags.length === 0) {
    return <p className="rounded-2xl border bg-card p-6 text-muted-foreground">No open flags.</p>;
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Most serious first, then oldest. {flags.length} open.
      </p>
      <ul className="flex flex-col gap-2">
        {flags.map((flag) => (
          <li
            key={flag.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"
          >
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <FlagChip severity={flag.severity} />
                <Link
                  href={`/orders/${flag.orderId}`}
                  className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {flag.orderNo}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {flag.customerName}
                  {flag.technicianName ? ` · ${flag.technicianName}` : ""}
                </span>
              </div>
              <p>{flag.message}</p>
              <p className="text-xs text-muted-foreground">
                {flag.source === "auto" ? "Raised automatically" : "Raised by staff"} ·{" "}
                {formatMytWhen(flag.raisedAt)}
              </p>
            </div>
            <ResolveFlagButton flagId={flag.id} message={flag.message} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function FlagsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl">Open flags</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading flags…</p>}>
        <OpenFlags />
      </Suspense>
    </div>
  );
}
