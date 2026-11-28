import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/features/home/LiveRefresh";
import { getTodayBoard } from "@/features/home/queries";
import { TodaySchedule } from "@/features/home/TodaySchedule";
import { resolvePeriod } from "@/features/kpi/period";
import { getKpiSummary } from "@/features/kpi/queries";
import { FLAG_SEVERITIES, SEVERITY_DOT, SEVERITY_LABEL } from "@/features/orders/labels";
import { formatSen } from "@/features/orders/money";
import { listReviewQueue } from "@/features/review/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Home · Sejuk Sejuk Ops" };

const REVIEW_PREVIEW = 5;
const MYT_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kuala_Lumpur",
});
const MYT_HOUR = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "Asia/Kuala_Lumpur",
});

function greeting(now: Date): string {
  const hour = Number(MYT_HOUR.format(now));
  return hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
}

function Tile({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border bg-card p-4 ${className}`}>
      <span className="text-sm opacity-80">{label}</span>
      <span className="font-heading text-3xl font-extrabold tabular-nums">{children}</span>
    </div>
  );
}

function FlagsBar({ counts }: { counts: Record<(typeof FLAG_SEVERITIES)[number], number> }) {
  const total = FLAG_SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:col-span-2">
      <span className="text-sm text-muted-foreground">Open flags · by severity</span>
      <div aria-hidden="true" className="flex h-3.5 overflow-hidden rounded-full bg-sand">
        {total > 0 &&
          FLAG_SEVERITIES.map((severity) => (
            <span
              key={severity}
              className={SEVERITY_DOT[severity]}
              style={{ flexGrow: counts[severity] }}
            />
          ))}
      </div>
      <Link href="/flags" className="flex flex-wrap gap-4 text-sm hover:underline">
        {FLAG_SEVERITIES.map((severity) => (
          <span key={severity} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${SEVERITY_DOT[severity]}`} />
            {SEVERITY_LABEL[severity]} {counts[severity]}
          </span>
        ))}
      </Link>
    </div>
  );
}

async function ReviewTile() {
  const queue = await listReviewQueue();
  return (
    <section
      aria-labelledby="review-tile-heading"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 lg:col-span-2"
    >
      <div className="flex items-center justify-between">
        <h2 id="review-tile-heading" className="text-lg">
          Review queue
        </h2>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold">
          {queue.total}
        </span>
      </div>
      {queue.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {queue.items.slice(0, REVIEW_PREVIEW).map((item) => (
            <li key={item.id}>
              <Link
                href={`/orders/${item.id}`}
                className="grid grid-cols-[0.75rem_1fr_auto] items-center gap-2 py-2 text-sm hover:bg-muted"
              >
                <span
                  aria-label={item.topFlag ? `${SEVERITY_LABEL[item.topFlag]} flag` : "No flags"}
                  className={`size-2 rounded-full ${item.topFlag ? SEVERITY_DOT[item.topFlag] : "bg-status-job-done"}`}
                />
                <span className="flex flex-col">
                  <span className="font-semibold">{item.customerName}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.topFlagMessage ??
                      `${item.orderNo}${item.technicianName ? ` · ${item.technicianName}` : ""}`}
                  </span>
                </span>
                <span className="tabular-nums">{formatSen(item.finalSen)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="outline" className="mt-auto rounded-full">
        <Link href="/review">Open review queue</Link>
      </Button>
    </section>
  );
}

async function Board() {
  const user = await requireUser(["admin", "manager"]);
  const now = new Date();
  const [board, week] = await Promise.all([getTodayBoard(), getKpiSummary(resolvePeriod({}, now))]);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <LiveRefresh />
        <p className="text-sm text-muted-foreground">{MYT_DAY.format(now)}</p>
        <h1 className="text-3xl">
          {greeting(now)}, {user.fullName}
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Tile label="Jobs today" className="border-ink bg-ink text-sand">
          {board.jobs.length}
        </Tile>
        <Tile label="In progress">{board.inProgress}</Tile>
        <Tile label="Awaiting review">{board.awaitingReview}</Tile>
        <Tile label="Week revenue" className="border-primary bg-primary text-primary-foreground">
          {formatSen(week.revenueSen)}
        </Tile>
        <FlagsBar counts={board.flagsBySeverity} />

        <div className="min-w-0 rounded-2xl border bg-card p-4 sm:col-span-2 lg:col-span-4">
          <TodaySchedule technicians={board.technicians} jobs={board.jobs} now={now} />
        </div>
        <ReviewTile />
      </div>
    </div>
  );
}

export default function StaffHomePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading today…</p>}>
      <Board />
    </Suspense>
  );
}
