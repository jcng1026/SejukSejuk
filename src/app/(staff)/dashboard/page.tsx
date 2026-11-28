import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JobsPerDayChart, ServiceMixChart } from "@/features/kpi/KpiCharts";
import { formatPeriod, resolvePeriod, type Period } from "@/features/kpi/period";
import {
  getJobsPerDay,
  getKpiSummary,
  getLeaderboard,
  getServiceMix,
} from "@/features/kpi/queries";
import { formatSen } from "@/features/orders/money";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard · Sejuk Sejuk Ops" };

const PRESETS = [
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
] as const;

function PeriodSwitcher({ period }: { period: Period }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <nav aria-label="Period" className="flex gap-1 rounded-full border bg-card p-1">
        {PRESETS.map(([key, label]) => (
          <Link
            key={key}
            href={`/dashboard?period=${key}`}
            aria-current={period.key === key ? "page" : undefined}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground aria-[current=page]:bg-ink aria-[current=page]:text-sand"
          >
            {label}
          </Link>
        ))}
      </nav>
      <form action="/dashboard" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="period" value="custom" />
        <div className="flex flex-col gap-1">
          <Label htmlFor="period-from">From</Label>
          <Input id="period-from" name="from" type="date" defaultValue={period.from} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="period-to">To</Label>
          <Input id="period-to" name="to" type="date" defaultValue={period.to} required />
        </div>
        <Button type="submit" variant="outline" className="rounded-full">
          Show
        </Button>
      </form>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-heading text-3xl font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

function minutesLabel(minutes: number | null): string {
  if (minutes === null) return "—";
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

async function Dashboard({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  await requireUser(["admin", "manager"]);
  const period = resolvePeriod(await searchParams);
  const [summary, leaderboard, perDay, mix] = await Promise.all([
    getKpiSummary(period),
    getLeaderboard(period),
    getJobsPerDay(period),
    getServiceMix(period),
  ]);
  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{formatPeriod(period)} · Malaysia time</p>
        <PeriodSwitcher period={period} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Jobs completed" value={summary.jobsCompleted} />
        <Card label="Revenue (final amounts)" value={formatSen(summary.revenueSen)} />
        <Card label="Payments collected" value={formatSen(summary.paymentsSen)} />
        <Card label="Open flags (now)" value={summary.openFlags} />
      </div>

      <section aria-labelledby="leaderboard-heading" className="rounded-2xl border bg-card p-4">
        <h2 id="leaderboard-heading" className="mb-3 text-lg">
          Technician leaderboard
        </h2>
        <div role="region" aria-label="Leaderboard table" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 font-normal">Technician</th>
                <th className="py-2 text-right font-normal">Jobs done</th>
                <th className="py-2 text-right font-normal">Revenue</th>
                <th className="py-2 text-right font-normal">Reschedules</th>
                <th className="py-2 text-right font-normal">Flags</th>
                <th className="py-2 text-right font-normal">Avg start → done</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr key={row.technicianId} className="border-t">
                  <td className="py-2 font-semibold">{row.name}</td>
                  <td className="py-2 text-right tabular-nums">{row.jobsCompleted}</td>
                  <td className="py-2 text-right tabular-nums">{formatSen(row.revenueSen)}</td>
                  <td className="py-2 text-right tabular-nums">{row.reschedules}</td>
                  <td className="py-2 text-right tabular-nums">{row.flags}</td>
                  <td className="py-2 text-right tabular-nums">{minutesLabel(row.avgMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <JobsPerDayChart data={perDay} />
        <ServiceMixChart data={mix} />
      </div>
    </>
  );
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl">Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading the numbers…</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
