import Link from "next/link";

import { StatusBadge } from "@/features/orders/badges";
import { formatSen } from "@/features/orders/money";
import { formatPhone } from "@/features/orders/phone";
import { formatMytWhen } from "@/features/orders/schedule";

import type { TechJob } from "./queries";

const MYT_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** The big "next job" card (mockup E): what, where, when, and one-tap navigate/call. */
export function NextJobCard({ job }: { job: TechJob }) {
  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
      aria-labelledby={`job-${job.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
          {job.status === "in_progress"
            ? "In progress"
            : `Next · ${MYT_TIME.format(new Date(job.scheduledAt))}`}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{job.orderNo}</span>
      </div>
      <h2 id={`job-${job.id}`} className="text-2xl">
        {job.serviceType}
      </h2>
      <p>{job.customerAddress}</p>
      <p className="text-sm text-muted-foreground">
        {job.customerName} · {formatPhone(job.customerPhone)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={mapsLink(job.customerAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center rounded-full border bg-background text-sm font-semibold"
        >
          Navigate
        </a>
        <a
          href={`tel:+${job.customerPhone}`}
          className="flex min-h-11 items-center justify-center rounded-full border bg-background text-sm font-semibold"
        >
          Call {job.customerName.split(" ")[0]}
        </a>
      </div>
    </article>
  );
}

/** One row in Today / Upcoming / History. */
export function JobRow({ job, showDate = false }: { job: TechJob; showDate?: boolean }) {
  return (
    <li>
      <Link
        href={`/tech/jobs/${job.id}`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3"
      >
        <span className="flex flex-col">
          <span className="font-semibold">
            {showDate ? formatMytWhen(job.scheduledAt) : MYT_TIME.format(new Date(job.scheduledAt))}{" "}
            · {job.serviceType}
          </span>
          <span className="text-sm text-muted-foreground">
            {job.customerName} · {job.customerAddress.split(",").at(-1)?.trim()}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <StatusBadge status={job.status} />
          {job.finalSen !== null && (
            <span className="text-xs text-muted-foreground">{formatSen(job.finalSen)}</span>
          )}
        </span>
      </Link>
    </li>
  );
}

/** Done-of-total ring for today's progress. */
export function DayRing({ done, total }: { done: number; total: number }) {
  const share = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      role="img"
      aria-label={`${done} of ${total} jobs done today`}
      className="grid size-16 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--primary) 0 ${share}%, var(--sand) 0)` }}
    >
      <span className="grid size-12 place-items-center rounded-full bg-background font-heading text-sm font-extrabold">
        {done}/{total}
      </span>
    </div>
  );
}
